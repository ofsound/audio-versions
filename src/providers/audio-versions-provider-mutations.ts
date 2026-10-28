import { useCallback, useMemo } from "react";
import { isoDateInLocalCalendar } from "#/lib/audio-versions/dates";
import {
	deleteAnnotation as deleteAnnotationRecord,
	deleteAudioFileCascade,
	deleteSongCascade,
	saveAnnotation,
	saveAudioBlob,
	saveAudioFile,
	saveSettings,
	saveSong,
} from "#/lib/audio-versions/db";
import {
	measureLoudnessFromAudioBuffer,
	normalizeLoudnessMetrics,
} from "#/lib/audio-versions/loudness";
import { normalizeRichText } from "#/lib/audio-versions/rich-text";
import {
	type AddAudioFileInput,
	type Annotation,
	type AudioFileRecord,
	type AudioVersionsUiSettings,
	type CreateAnnotationInput,
	type CreateSongInput,
	createDefaultWorkspaceState,
	normalizeUiSettings,
	type Playlist,
	type Song,
	type WorkspaceState,
} from "#/lib/audio-versions/types";
import {
	extractWaveformFromAudioBuffer,
	normalizeAudioBlobForBrowser,
	normalizeVolumeDb,
	withDecodedAudio,
} from "#/lib/audio-versions/waveform";
import {
	deleteRemoteAudio,
	deleteRemoteSongGallery,
	uploadRemoteAudio,
} from "#/lib/cloud/media";
import type { CloudPersistence } from "#/lib/cloud/persistence";
import {
	findEntityById,
	patchEntityById,
	removeEntityById,
} from "./audio-versions-provider-mutation-helpers";
import type { CommitSnapshot } from "./audio-versions-provider-state";

interface UseSongMutationsOptions {
	cloud: CloudPersistence | null;
	commitSnapshot: CommitSnapshot;
	prunePlaybackState: (audioFileIds: string[]) => void;
	removeRegisteredAudio: (audioFileIds: string[]) => void;
}

interface UseAudioFileMutationsOptions {
	cloud: CloudPersistence | null;
	cloudUserId?: string;
	commitSnapshot: CommitSnapshot;
	prunePlaybackState: (audioFileIds: string[]) => void;
	removeRegisteredAudio: (audioFileIds: string[]) => void;
	setError: (error: string | null) => void;
}

interface UseAnnotationMutationsOptions {
	cloud: CloudPersistence | null;
	commitSnapshot: CommitSnapshot;
}

interface UseWorkspaceMutationsOptions {
	cloud: CloudPersistence | null;
	commitSnapshot: CommitSnapshot;
}

export function useSongMutations({
	cloud,
	commitSnapshot,
	prunePlaybackState,
	removeRegisteredAudio,
}: UseSongMutationsOptions) {
	const createSong = useCallback(
		async (input: CreateSongInput) => {
			const now = new Date().toISOString();
			const song: Song = {
				id: crypto.randomUUID(),
				title: input.title.trim(),
				artist: input.artist.trim(),
				project: input.project.trim(),
				generalNotes: input.generalNotes,
				audioFileOrder: [],
				createdAt: now,
				updatedAt: now,
			};

			const next = await commitSnapshot(
				(current) => ({
					...current,
					songs: [song, ...current.songs],
					settings: {
						...current.settings,
						workspaceBySongId: {
							...current.settings.workspaceBySongId,
							[song.id]: createDefaultWorkspaceState(),
						},
					},
				}),
				async (nextSnapshot) => {
					await Promise.all([
						saveSong(song),
						saveSettings(nextSnapshot.settings),
						cloud?.saveSong(song),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);

			return next.songs.find((entry) => entry.id === song.id) ?? song;
		},
		[cloud, commitSnapshot],
	);

	const updateSong = useCallback(
		async (songId: string, patch: Partial<Song>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: patchEntityById(current.songs, songId, (song) => ({
						...song,
						...patch,
						generalNotes: patch.generalNotes ?? song.generalNotes,
						updatedAt: new Date().toISOString(),
					})),
				}),
				async (nextSnapshot) => {
					const song = findEntityById(nextSnapshot.songs, songId);
					if (song) {
						await Promise.all([saveSong(song), cloud?.saveSong(song)]);
					}
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const deleteSong = useCallback(
		async (songId: string) => {
			let audioFileIds: string[] = [];

			await commitSnapshot(
				(current) => {
					audioFileIds = current.audioFiles
						.filter((audioFile) => audioFile.songId === songId)
						.map((audioFile) => audioFile.id);
					const now = new Date().toISOString();
					const recents = current.settings.recents.filter(
						(id) => id !== songId,
					);

					return {
						...current,
						songs: patchEntityById(current.songs, songId, (song) => ({
							...song,
							deletedAt: now,
							updatedAt: now,
						})),
						settings: {
							...current.settings,
							recents,
							lastOpenSongId:
								current.settings.lastOpenSongId === songId
									? recents[0]
									: current.settings.lastOpenSongId,
						},
					};
				},
				async (nextSnapshot) => {
					const song = findEntityById(nextSnapshot.songs, songId);
					await Promise.all([
						song ? saveSong(song) : undefined,
						cloud?.deleteSong(songId),
						saveSettings(nextSnapshot.settings),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);

			removeRegisteredAudio(audioFileIds);
			prunePlaybackState(audioFileIds);
		},
		[cloud, commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	const restoreSong = useCallback(
		async (songId: string) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: patchEntityById(current.songs, songId, (song) => {
						const { deletedAt: _deletedAt, ...rest } = song;
						return { ...rest, updatedAt: new Date().toISOString() };
					}),
				}),
				async (nextSnapshot) => {
					const song = findEntityById(nextSnapshot.songs, songId);
					await Promise.all([
						song ? saveSong(song) : undefined,
						cloud?.restoreSong(songId),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const permanentlyDeleteSong = useCallback(
		async (songId: string) => {
			let audioFileIds: string[] = [];
			let remoteAudioFileIds: string[] = [];
			let annotationIds: string[] = [];
			let updatedPlaylists: Playlist[] = [];

			await commitSnapshot(
				(current) => {
					audioFileIds = current.audioFiles
						.filter((audioFile) => audioFile.songId === songId)
						.map((audioFile) => audioFile.id);
					remoteAudioFileIds = current.audioFiles
						.filter(
							(audioFile) =>
								audioFile.songId === songId && audioFile.remoteMedia,
						)
						.map((audioFile) => audioFile.id);
					annotationIds = current.annotations
						.filter((annotation) => annotation.songId === songId)
						.map((annotation) => annotation.id);
					const audioFileIdSet = new Set(audioFileIds);
					const now = new Date().toISOString();
					updatedPlaylists = current.playlists
						.filter((playlist) =>
							playlist.audioFileIds.some((id) => audioFileIdSet.has(id)),
						)
						.map((playlist) => ({
							...playlist,
							audioFileIds: playlist.audioFileIds.filter(
								(id) => !audioFileIdSet.has(id),
							),
							updatedAt: now,
						}));
					const updatedPlaylistsById = new Map(
						updatedPlaylists.map((playlist) => [playlist.id, playlist]),
					);
					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					delete workspaceBySongId[songId];
					const blobsByAudioId = { ...current.blobsByAudioId };
					for (const fileId of audioFileIdSet) delete blobsByAudioId[fileId];

					return {
						...current,
						songs: removeEntityById(current.songs, songId),
						audioFiles: current.audioFiles.filter(
							(file) => file.songId !== songId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.songId !== songId,
						),
						playlists: current.playlists.map(
							(playlist) => updatedPlaylistsById.get(playlist.id) ?? playlist,
						),
						blobsByAudioId,
						settings: { ...current.settings, workspaceBySongId },
					};
				},
				async (nextSnapshot) => {
					if (cloud) await deleteRemoteSongGallery(songId);
					await Promise.all(remoteAudioFileIds.map(deleteRemoteAudio));
					await deleteSongCascade({
						songId,
						audioFileIds,
						annotationIds,
						playlists: updatedPlaylists,
						settings: nextSnapshot.settings,
					});
					await Promise.all([
						cloud?.permanentlyDeleteSong(songId),
						cloud?.saveSettings(nextSnapshot.settings),
						...updatedPlaylists.map((playlist) =>
							cloud?.savePlaylist(playlist),
						),
					]);
				},
			);

			removeRegisteredAudio(audioFileIds);
			prunePlaybackState(audioFileIds);
		},
		[cloud, commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	return useMemo(
		() => ({
			createSong,
			deleteSong,
			permanentlyDeleteSong,
			restoreSong,
			updateSong,
		}),
		[createSong, deleteSong, permanentlyDeleteSong, restoreSong, updateSong],
	);
}

export function useAudioFileMutations({
	cloud,
	cloudUserId,
	commitSnapshot,
	prunePlaybackState,
	removeRegisteredAudio,
	setError,
}: UseAudioFileMutationsOptions) {
	const addAudioFile = useCallback(
		async (songId: string, input: AddAudioFileInput) => {
			setError(null);
			// Capture bytes before decoding, uploading, or waiting on persistence.
			// A disk-backed File can become invalid if the source changes meanwhile.
			const importedFile = new File(
				[await input.file.arrayBuffer()],
				input.file.name,
				{
					type: input.file.type,
					lastModified: input.file.lastModified,
				},
			);
			const browserAudioBlob = await normalizeAudioBlobForBrowser(importedFile);
			const { loudness, waveform } = await withDecodedAudio(
				browserAudioBlob,
				(audioBuffer) => ({
					loudness: measureLoudnessFromAudioBuffer(audioBuffer) ?? undefined,
					waveform: extractWaveformFromAudioBuffer(audioBuffer),
				}),
			);
			const now = new Date().toISOString();
			const sessionDate = input.sessionDate.trim() || isoDateInLocalCalendar();
			const audioFileId = crypto.randomUUID();
			const remoteMedia = cloudUserId
				? await uploadRemoteAudio(cloudUserId, audioFileId, importedFile)
				: undefined;
			const audioFile: AudioFileRecord = {
				id: audioFileId,
				songId,
				title: input.title.trim() || input.file.name.replace(/\.[^.]+$/, ""),
				sessionDate,
				notes: normalizeRichText(input.notes),
				volumeDb: 0,
				durationMs: waveform.durationMs,
				waveform,
				...(loudness ? { loudness } : {}),
				...(remoteMedia ? { remoteMedia } : {}),
				createdAt: now,
				updatedAt: now,
			};

			await commitSnapshot(
				(current) => ({
					...current,
					songs: current.songs.map((song) =>
						song.id === songId
							? {
									...song,
									audioFileOrder: [...song.audioFileOrder, audioFile.id],
									updatedAt: now,
								}
							: song,
					),
					audioFiles: [...current.audioFiles, audioFile],
					blobsByAudioId: {
						...current.blobsByAudioId,
						[audioFile.id]: browserAudioBlob,
					},
				}),
				async (nextSnapshot) => {
					const song = nextSnapshot.songs.find((entry) => entry.id === songId);
					await Promise.all([
						saveAudioFile(audioFile),
						saveAudioBlob(audioFile.id, importedFile),
						song ? saveSong(song) : Promise.resolve(),
						cloud?.saveAudioFile(audioFile),
						song ? cloud?.saveSong(song) : undefined,
					]);
				},
			);

			return audioFile;
		},
		[cloud, cloudUserId, commitSnapshot, setError],
	);

	const updateAudioFile = useCallback(
		async (audioFileId: string, patch: Partial<AudioFileRecord>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					audioFiles: patchEntityById(
						current.audioFiles,
						audioFileId,
						(audioFile) => ({
							...audioFile,
							...patch,
							notes: normalizeRichText(patch.notes ?? audioFile.notes),
							volumeDb: normalizeVolumeDb(patch.volumeDb ?? audioFile.volumeDb),
							loudness: normalizeLoudnessMetrics(
								patch.loudness ?? audioFile.loudness,
							),
							updatedAt: new Date().toISOString(),
						}),
					),
				}),
				async (nextSnapshot) => {
					const audioFile = findEntityById(
						nextSnapshot.audioFiles,
						audioFileId,
					);
					if (audioFile) {
						await Promise.all([
							saveAudioFile(audioFile),
							cloud?.saveAudioFile(audioFile),
						]);
					}
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const deleteAudioFile = useCallback(
		async (audioFileId: string) => {
			let didDeleteFile = false;
			let hadRemoteMedia = false;
			let deletedAnnotationIds: string[] = [];
			let updatedSongId: string | undefined;
			let updatedPlaylists: Playlist[] = [];

			await commitSnapshot(
				(current) => {
					const targetFile = current.audioFiles.find(
						(audioFile) => audioFile.id === audioFileId,
					);
					if (!targetFile) {
						return current;
					}

					didDeleteFile = true;
					hadRemoteMedia = Boolean(
						targetFile.remoteMedia ||
							targetFile.galleryImages?.some((image) => image.remoteMedia),
					);
					updatedSongId = targetFile.songId;
					deletedAnnotationIds = current.annotations
						.filter((annotation) => annotation.audioFileId === audioFileId)
						.map((annotation) => annotation.id);
					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					const songWorkspace = workspaceBySongId[targetFile.songId];
					if (songWorkspace) {
						const playheadMsByFileId = { ...songWorkspace.playheadMsByFileId };
						delete playheadMsByFileId[audioFileId];

						workspaceBySongId[targetFile.songId] = {
							...songWorkspace,
							playheadMsByFileId,
						};
					}
					const blobsByAudioId = { ...current.blobsByAudioId };
					delete blobsByAudioId[audioFileId];
					const playlistUpdatedAt = new Date().toISOString();
					updatedPlaylists = current.playlists
						.filter((playlist) => playlist.audioFileIds.includes(audioFileId))
						.map((playlist) => ({
							...playlist,
							audioFileIds: playlist.audioFileIds.filter(
								(id) => id !== audioFileId,
							),
							updatedAt: playlistUpdatedAt,
						}));
					const updatedPlaylistsById = new Map(
						updatedPlaylists.map((playlist) => [playlist.id, playlist]),
					);

					return {
						...current,
						songs: current.songs.map((song) =>
							song.id === targetFile.songId
								? {
										...song,
										starredAudioFileId:
											song.starredAudioFileId === audioFileId
												? null
												: song.starredAudioFileId,
										audioFileOrder: song.audioFileOrder.filter(
											(fileId) => fileId !== audioFileId,
										),
										updatedAt: new Date().toISOString(),
									}
								: song,
						),
						audioFiles: current.audioFiles.filter(
							(audioFile) => audioFile.id !== audioFileId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.audioFileId !== audioFileId,
						),
						blobsByAudioId,
						playlists: current.playlists.map(
							(playlist) => updatedPlaylistsById.get(playlist.id) ?? playlist,
						),
						settings: {
							...current.settings,
							workspaceBySongId,
						},
					};
				},
				async (nextSnapshot) => {
					if (!didDeleteFile) {
						return;
					}

					const updatedSong = updatedSongId
						? findEntityById(nextSnapshot.songs, updatedSongId)
						: undefined;
					await deleteAudioFileCascade({
						audioFileId,
						annotationIds: deletedAnnotationIds,
						playlists: updatedPlaylists,
						settings: nextSnapshot.settings,
						song: updatedSong,
					});
					if (hadRemoteMedia) {
						await deleteRemoteAudio(audioFileId);
					}
					await Promise.all([
						cloud?.deleteAudioFile(audioFileId),
						cloud?.saveSettings(nextSnapshot.settings),
						updatedSong ? cloud?.saveSong(updatedSong) : undefined,
						...updatedPlaylists.map((playlist) =>
							cloud?.savePlaylist(playlist),
						),
					]);
				},
			);

			if (!didDeleteFile) {
				return;
			}

			removeRegisteredAudio([audioFileId]);
			prunePlaybackState([audioFileId]);
		},
		[cloud, commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	const reorderAudioFiles = useCallback(
		async (songId: string, orderedIds: string[]) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: patchEntityById(current.songs, songId, (song) => ({
						...song,
						audioFileOrder: orderedIds,
						updatedAt: new Date().toISOString(),
					})),
				}),
				async (nextSnapshot) => {
					const song = findEntityById(nextSnapshot.songs, songId);
					if (song) {
						await Promise.all([saveSong(song), cloud?.saveSong(song)]);
					}
				},
			);
		},
		[cloud, commitSnapshot],
	);

	return useMemo(
		() => ({
			addAudioFile,
			deleteAudioFile,
			reorderAudioFiles,
			updateAudioFile,
		}),
		[addAudioFile, deleteAudioFile, reorderAudioFiles, updateAudioFile],
	);
}

export function useAnnotationMutations({
	cloud,
	commitSnapshot,
}: UseAnnotationMutationsOptions) {
	const createAnnotation = useCallback(
		async (input: CreateAnnotationInput) => {
			const now = new Date().toISOString();
			const annotation: Annotation = {
				id: crypto.randomUUID(),
				...input,
				detail: normalizeRichText(input.detail),
				updatedAt: now,
				createdAt: now,
			};

			await commitSnapshot(
				(current) => ({
					...current,
					annotations: [...current.annotations, annotation],
				}),
				async () => {
					await Promise.all([
						saveAnnotation(annotation),
						cloud?.saveAnnotation(annotation),
					]);
				},
			);

			return annotation;
		},
		[cloud, commitSnapshot],
	);

	const restoreAnnotation = useCallback(
		async (annotation: Annotation) => {
			await commitSnapshot(
				(current) => ({
					...current,
					annotations: [
						...removeEntityById(current.annotations, annotation.id),
						annotation,
					],
				}),
				async () => {
					await Promise.all([
						saveAnnotation(annotation),
						cloud?.saveAnnotation(annotation),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const updateAnnotation = useCallback(
		async (annotationId: string, patch: Partial<Annotation>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					annotations: patchEntityById(
						current.annotations,
						annotationId,
						(annotation) => ({
							...annotation,
							...patch,
							detail: normalizeRichText(patch.detail ?? annotation.detail),
							updatedAt: new Date().toISOString(),
						}),
					),
				}),
				async (nextSnapshot) => {
					const annotation = findEntityById(
						nextSnapshot.annotations,
						annotationId,
					);
					if (annotation) {
						await Promise.all([
							saveAnnotation(annotation),
							cloud?.saveAnnotation(annotation),
						]);
					}
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const deleteAnnotation = useCallback(
		async (annotationId: string) => {
			await commitSnapshot(
				(current) => ({
					...current,
					annotations: removeEntityById(current.annotations, annotationId),
				}),
				async () => {
					await Promise.all([
						deleteAnnotationRecord(annotationId),
						cloud?.deleteAnnotation(annotationId),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	return useMemo(
		() => ({
			createAnnotation,
			deleteAnnotation,
			restoreAnnotation,
			updateAnnotation,
		}),
		[createAnnotation, deleteAnnotation, restoreAnnotation, updateAnnotation],
	);
}

export function useWorkspaceMutations({
	cloud,
	commitSnapshot,
}: UseWorkspaceMutationsOptions) {
	const updateUiSettings = useCallback(
		async (
			patch:
				| Partial<AudioVersionsUiSettings>
				| ((current: AudioVersionsUiSettings) => AudioVersionsUiSettings),
		) => {
			await commitSnapshot(
				(current) => {
					const nextUiSettings =
						typeof patch === "function"
							? normalizeUiSettings(patch(current.settings.ui))
							: normalizeUiSettings({
									...current.settings.ui,
									...patch,
								});

					return {
						...current,
						settings: {
							...current.settings,
							ui: nextUiSettings,
						},
					};
				},
				async (nextSnapshot) => {
					await Promise.all([
						saveSettings(nextSnapshot.settings),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const updateWorkspaceState = useCallback(
		async (
			songId: string,
			patch:
				| Partial<WorkspaceState>
				| ((current: WorkspaceState) => WorkspaceState),
		) => {
			await commitSnapshot(
				(current) => {
					const currentWorkspace =
						current.settings.workspaceBySongId[songId] ??
						createDefaultWorkspaceState();
					const nextWorkspace =
						typeof patch === "function"
							? patch(currentWorkspace)
							: {
									...currentWorkspace,
									...patch,
								};

					return {
						...current,
						settings: {
							...current.settings,
							workspaceBySongId: {
								...current.settings.workspaceBySongId,
								[songId]: nextWorkspace,
							},
						},
					};
				},
				async (nextSnapshot) => {
					await Promise.all([
						saveSettings(nextSnapshot.settings),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const rememberSongOpened = useCallback(
		async (songId: string) => {
			await commitSnapshot(
				(current) => {
					const recents = [
						songId,
						...current.settings.recents.filter((id) => id !== songId),
					].slice(0, 8);
					const workspace =
						current.settings.workspaceBySongId[songId] ??
						createDefaultWorkspaceState();

					return {
						...current,
						settings: {
							...current.settings,
							lastOpenSongId: songId,
							recents,
							workspaceBySongId: {
								...current.settings.workspaceBySongId,
								[songId]: {
									...workspace,
									lastVisitedAt: new Date().toISOString(),
								},
							},
						},
					};
				},
				async (nextSnapshot) => {
					await Promise.all([
						saveSettings(nextSnapshot.settings),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	return useMemo(
		() => ({
			rememberSongOpened,
			updateUiSettings,
			updateWorkspaceState,
		}),
		[rememberSongOpened, updateUiSettings, updateWorkspaceState],
	);
}
