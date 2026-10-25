import type { Song, SongNoteTab } from "./types";

const LEGACY_NOTE_TAB_ID = "song-notes";

/** generalNotes remains authoritative for the first tab, including edits from iOS. */
export function getSongNoteTabs(song: Song): SongNoteTab[] {
	const tabs = song.noteTabs?.length
		? song.noteTabs
		: [
				{
					id: LEGACY_NOTE_TAB_ID,
					name: "Song Notes",
					content: song.generalNotes,
				},
			];
	return tabs.map((tab, index) =>
		index === 0 ? { ...tab, content: song.generalNotes } : tab,
	);
}

export function changeSongNoteTabs(
	song: Song,
	update: (tabs: SongNoteTab[]) => SongNoteTab[],
): Song {
	const tabs = update(getSongNoteTabs(song));
	return {
		...song,
		noteTabs: tabs,
		generalNotes: tabs[0]?.content ?? "",
		updatedAt: new Date().toISOString(),
	};
}
export function noteTabName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > 80)
		throw new Error("Use a tab name between 1 and 80 characters.");
	return trimmed;
}
