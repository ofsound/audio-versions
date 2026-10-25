import { useCallback, useMemo } from "react";
import { saveSong } from "#/lib/audio-versions/db";
import {
	changeSongNoteTabs,
	noteTabName,
} from "#/lib/audio-versions/song-note-tabs";
import type { SongNoteTab } from "#/lib/audio-versions/types";
import type { CloudPersistence } from "#/lib/cloud/persistence";
import type { CommitSnapshot } from "./audio-versions-provider-state";

export function useNoteTabMutations({
	cloud,
	commitSnapshot,
}: {
	cloud: CloudPersistence | null;
	commitSnapshot: CommitSnapshot;
}) {
	const mutate = useCallback(
		async (songId: string, update: (tabs: SongNoteTab[]) => SongNoteTab[]) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: current.songs.map((song) =>
						song.id === songId && !song.deletedAt
							? changeSongNoteTabs(song, update)
							: song,
					),
				}),
				async (next) => {
					const song = next.songs.find((song) => song.id === songId);
					if (song) await Promise.all([saveSong(song), cloud?.saveSong(song)]);
				},
			);
		},
		[cloud, commitSnapshot],
	);
	const createNoteTab = useCallback(
		async (songId: string, name: string) => {
			const tab = {
				id: crypto.randomUUID(),
				name: noteTabName(name),
				content: "",
			};
			await mutate(songId, (tabs) => [...tabs, tab]);
			return tab.id;
		},
		[mutate],
	);
	const updateNoteTab = useCallback(
		async (
			songId: string,
			tabId: string,
			patch: Partial<Pick<SongNoteTab, "name" | "content">>,
		) => {
			const nextPatch = {
				...patch,
				...(patch.name !== undefined ? { name: noteTabName(patch.name) } : {}),
			};
			await mutate(songId, (tabs) =>
				tabs.map((tab) => (tab.id === tabId ? { ...tab, ...nextPatch } : tab)),
			);
		},
		[mutate],
	);
	const deleteNoteTab = useCallback(
		async (songId: string, tabId: string) => {
			await mutate(songId, (tabs) => {
				if (tabs.length <= 1)
					throw new Error(
						"Keep at least one note tab. Close it or clear its text instead.",
					);
				return tabs.filter((tab) => tab.id !== tabId);
			});
		},
		[mutate],
	);
	return useMemo(
		() => ({ createNoteTab, updateNoteTab, deleteNoteTab }),
		[createNoteTab, updateNoteTab, deleteNoteTab],
	);
}
