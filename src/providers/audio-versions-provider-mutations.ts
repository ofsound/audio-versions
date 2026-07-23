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
	type Song,
	type WorkspaceState,
} from "#/lib/audio-versions/types";
import {
	generateWaveformFromFile,
	normalizeAudioBlobForBrowser,
	normalizeVolumeDb,
} from "#/lib/audio-versions/waveform";
import { deleteRemoteAudio, uploadRemoteAudio } from "#/lib/cloud/media";
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
			let deletedAudioFileIds: string[] = [];
			let deletedRemoteAudioFileIds: string[] = [];
			let deletedAnnotationIds: string[] = [];

			await commitSnapshot(
				(current) => {
					deletedAudioFileIds = current.audioFiles
						.filter((audioFile) => audioFile.songId === songId)
						.map((audioFile) => audioFile.id);
					deletedRemoteAudioFileIds = current.audioFiles
						.filter(
							(audioFile) =>
								audioFile.songId === songId && Boolean(audioFile.remoteMedia),
						)
						.map((audioFile) => audioFile.id);
					deletedAnnotationIds = current.annotations
						.filter((annotation) => annotation.songId === songId)
						.map((annotation) => annotation.id);
					const deletedAudioFileIdSet = new Set(deletedAudioFileIds);
					const recents = current.settings.recents.filter(
						(id) => id !== songId,
					);
					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					delete workspaceBySongId[songId];
					const blobsByAudioId = { ...current.blobsByAudioId };
					for (const fileId of deletedAudioFileIdSet) {
						delete blobsByAudioId[fileId];
					}

					return {
						...current,
						songs: removeEntityById(current.songs, songId),
						audioFiles: current.audioFiles.filter(
							(audioFile) => audioFile.songId !== songId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.songId !== songId,
						),
						blobsByAudioId,
						settings: {
							...current.settings,
							recents,
							lastOpenSongId:
								current.settings.lastOpenSongId === songId
									? recents[0]
									: current.settings.lastOpenSongId,
							workspaceBySongId,
						},
					};
				},
				async (nextSnapshot) => {
					await deleteSongCascade({
						songId,
						audioFileIds: deletedAudioFileIds,
						annotationIds: deletedAnnotationIds,
						settings: nextSnapshot.settings,
					});
					await Promise.all(deletedRemoteAudioFileIds.map(deleteRemoteAudio));
					await Promise.all([
						cloud?.deleteSong(songId),
						cloud?.saveSettings(nextSnapshot.settings),
					]);
				},
			);

			if (deletedAudioFileIds.length === 0) {
				return;
			}

			removeRegisteredAudio(deletedAudioFileIds);
			prunePlaybackState(deletedAudioFileIds);
		},
		[cloud, commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	return useMemo(
		() => ({
			createSong,
			deleteSong,
			updateSong,
		}),
		[createSong, deleteSong, updateSong],
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
			const browserAudioBlob = await normalizeAudioBlobForBrowser(input.file);
			const waveform = await generateWaveformFromFile(browserAudioBlob);
			const now = new Date().toISOString();
			const sessionDate = input.sessionDate.trim() || isoDateInLocalCalendar();
			const audioFileId = crypto.randomUUID();
			const remoteMedia = cloudUserId
				? await uploadRemoteAudio(cloudUserId, audioFileId, input.file)
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
						saveAudioBlob(audioFile.id, input.file),
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

			await commitSnapshot(
				(current) => {
					const targetFile = current.audioFiles.find(
						(audioFile) => audioFile.id === audioFileId,
					);
					if (!targetFile) {
						return current;
					}

					didDeleteFile = true;
					hadRemoteMedia = Boolean(targetFile.remoteMedia);
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

					return {
						...current,
						songs: current.songs.map((song) =>
							song.id === targetFile.songId
								? {
										...song,
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
				title: input.title.trim(),
				body: normalizeRichText(input.body),
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
							body: normalizeRichText(patch.body ?? annotation.body),
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
			updateAnnotation,
		}),
		[createAnnotation, deleteAnnotation, updateAnnotation],
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
