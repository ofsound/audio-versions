import { useCallback, useMemo } from "react";
import {
	deletePlaylist as deletePlaylistRecord,
	savePlaylist,
} from "#/lib/audio-versions/db";
import type { CreatePlaylistInput, Playlist } from "#/lib/audio-versions/types";
import type { CloudPersistence } from "#/lib/cloud/persistence";
import {
	patchEntityById,
	removeEntityById,
} from "./audio-versions-provider-mutation-helpers";
import type { CommitSnapshot } from "./audio-versions-provider-state";

interface UsePlaylistMutationsOptions {
	cloud: CloudPersistence | null;
	commitSnapshot: CommitSnapshot;
}

function uniqueIds(ids: string[]): string[] {
	return Array.from(new Set(ids));
}

export function usePlaylistMutations({
	cloud,
	commitSnapshot,
}: UsePlaylistMutationsOptions) {
	const createPlaylist = useCallback(
		async (input: CreatePlaylistInput) => {
			const name = input.name.trim();
			if (!name) {
				throw new Error("A playlist name is required.");
			}

			const now = new Date().toISOString();
			const playlist: Playlist = {
				id: crypto.randomUUID(),
				name,
				audioFileIds: uniqueIds(input.audioFileIds ?? []),
				sortOrder: 0,
				createdAt: now,
				updatedAt: now,
			};

			const next = await commitSnapshot(
				(current) => {
					const maxSortOrder = current.playlists.reduce(
						(maximum, entry) => Math.max(maximum, entry.sortOrder),
						-1,
					);
					playlist.sortOrder = maxSortOrder + 1;
					return { ...current, playlists: [...current.playlists, playlist] };
				},
				async () => {
					await Promise.all([
						savePlaylist(playlist),
						cloud?.savePlaylist(playlist),
					]);
				},
			);

			return (
				next.playlists.find((entry) => entry.id === playlist.id) ?? playlist
			);
		},
		[cloud, commitSnapshot],
	);

	const updatePlaylist = useCallback(
		async (
			playlistId: string,
			patch: Partial<Pick<Playlist, "name" | "audioFileIds">>,
		) => {
			if (patch.name !== undefined && !patch.name.trim()) {
				throw new Error("A playlist name is required.");
			}

			await commitSnapshot(
				(current) => ({
					...current,
					playlists: patchEntityById(
						current.playlists,
						playlistId,
						(playlist) => ({
							...playlist,
							...(patch.name === undefined ? {} : { name: patch.name.trim() }),
							...(patch.audioFileIds === undefined
								? {}
								: { audioFileIds: uniqueIds(patch.audioFileIds) }),
							updatedAt: new Date().toISOString(),
						}),
					),
				}),
				async (nextSnapshot) => {
					const playlist = nextSnapshot.playlists.find(
						(entry) => entry.id === playlistId,
					);
					if (playlist) {
						await Promise.all([
							savePlaylist(playlist),
							cloud?.savePlaylist(playlist),
						]);
					}
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const addAudioFileToPlaylist = useCallback(
		(playlistId: string, audioFileId: string) =>
			commitSnapshot(
				(current) => ({
					...current,
					playlists: patchEntityById(
						current.playlists,
						playlistId,
						(playlist) =>
							playlist.audioFileIds.includes(audioFileId)
								? playlist
								: {
										...playlist,
										audioFileIds: [...playlist.audioFileIds, audioFileId],
										updatedAt: new Date().toISOString(),
									},
					),
				}),
				async (nextSnapshot) => {
					const playlist = nextSnapshot.playlists.find(
						(entry) => entry.id === playlistId,
					);
					if (playlist) {
						await Promise.all([
							savePlaylist(playlist),
							cloud?.savePlaylist(playlist),
						]);
					}
				},
			).then(() => undefined),
		[cloud, commitSnapshot],
	);

	const removeAudioFileFromPlaylist = useCallback(
		(playlistId: string, audioFileId: string) =>
			commitSnapshot(
				(current) => ({
					...current,
					playlists: patchEntityById(
						current.playlists,
						playlistId,
						(playlist) => ({
							...playlist,
							audioFileIds: playlist.audioFileIds.filter(
								(id) => id !== audioFileId,
							),
							updatedAt: new Date().toISOString(),
						}),
					),
				}),
				async (nextSnapshot) => {
					const playlist = nextSnapshot.playlists.find(
						(entry) => entry.id === playlistId,
					);
					if (playlist) {
						await Promise.all([
							savePlaylist(playlist),
							cloud?.savePlaylist(playlist),
						]);
					}
				},
			).then(() => undefined),
		[cloud, commitSnapshot],
	);

	const setPlaylistAudioFileIds = useCallback(
		(playlistId: string, audioFileIds: string[]) =>
			updatePlaylist(playlistId, { audioFileIds }),
		[updatePlaylist],
	);

	const deletePlaylist = useCallback(
		async (playlistId: string) => {
			await commitSnapshot(
				(current) => ({
					...current,
					playlists: removeEntityById(current.playlists, playlistId),
				}),
				async () => {
					await Promise.all([
						deletePlaylistRecord(playlistId),
						cloud?.deletePlaylist(playlistId),
					]);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	const reorderPlaylists = useCallback(
		async (orderedIds: string[]) => {
			await commitSnapshot(
				(current) => {
					const positions = new Map(orderedIds.map((id, index) => [id, index]));
					const now = new Date().toISOString();
					return {
						...current,
						playlists: current.playlists.map((playlist) => {
							const sortOrder = positions.get(playlist.id);
							return sortOrder === undefined || sortOrder === playlist.sortOrder
								? playlist
								: { ...playlist, sortOrder, updatedAt: now };
						}),
					};
				},
				async (nextSnapshot) => {
					const changed = nextSnapshot.playlists.filter((playlist) =>
						orderedIds.includes(playlist.id),
					);
					await Promise.all(
						changed.flatMap((playlist) => [
							savePlaylist(playlist),
							cloud?.savePlaylist(playlist),
						]),
					);
				},
			);
		},
		[cloud, commitSnapshot],
	);

	return useMemo(
		() => ({
			addAudioFileToPlaylist,
			createPlaylist,
			deletePlaylist,
			removeAudioFileFromPlaylist,
			reorderPlaylists,
			setPlaylistAudioFileIds,
			updatePlaylist,
		}),
		[
			addAudioFileToPlaylist,
			createPlaylist,
			deletePlaylist,
			removeAudioFileFromPlaylist,
			reorderPlaylists,
			setPlaylistAudioFileIds,
			updatePlaylist,
		],
	);
}
