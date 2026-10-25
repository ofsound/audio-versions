import { describe, expect, it } from "vitest";
import { buildSongTargetPath, parseSongTarget } from "./links";
import { searchAudioVersions } from "./search";
import {
	changeSongNoteTabs,
	getSongNoteTabs,
	noteTabName,
} from "./song-note-tabs";
import { createDefaultUiSettings, type Song } from "./types";

const song: Song = {
	id: "song",
	title: "Mix",
	artist: "",
	project: "",
	generalNotes: "Legacy text",
	audioFileOrder: [],
	createdAt: "today",
	updatedAt: "today",
};
describe("named Song Notes", () => {
	it("keeps legacy content authoritative while preserving independent named documents", () => {
		expect(getSongNoteTabs(song)).toEqual([
			{ id: "song-notes", name: "Song Notes", content: "Legacy text" },
		]);
		const multi = {
			...song,
			noteTabs: [
				{ id: "first", name: "Mixing", content: "Stale" },
				{ id: "master", name: "Mastering", content: "Limiter" },
			],
		};
		expect(getSongNoteTabs(multi)[0].content).toBe("Legacy text");
		const next = changeSongNoteTabs(multi, (tabs) =>
			tabs.map((tab) =>
				tab.id === "master" ? { ...tab, content: "New limiter" } : tab,
			),
		);
		expect(next.generalNotes).toBe("Legacy text");
		expect(next.noteTabs?.[1].content).toBe("New limiter");
		const first = changeSongNoteTabs(next, (tabs) =>
			tabs.map((tab, index) =>
				index === 0 ? { ...tab, content: "New primary" } : tab,
			),
		);
		expect(first.generalNotes).toBe("New primary");
		expect(first.noteTabs?.[1].content).toBe("New limiter");
	});
	it("searches non-primary tabs and deep-links to the matching document", () => {
		const multi = {
			...song,
			noteTabs: [
				{ id: "song-notes", name: "Mixing", content: "" },
				{ id: "master", name: "Mastering", content: "Check limiter ceiling" },
			],
		};
		const results = searchAudioVersions(
			{ songs: [multi], audioFiles: [], annotations: [] },
			"limiter",
			createDefaultUiSettings(),
		);
		const hit = results.find((result) => result.type === "journal");
		expect(hit?.target).toMatchObject({ songId: "song", noteTabId: "master" });
		if (!hit) throw new Error("Missing matching note tab");
		expect(parseSongTarget(buildSongTargetPath(hit.target))?.noteTabId).toBe(
			"master",
		);
	});
	it("rejects blank names and malformed links without crashing notes rendering", () => {
		expect(() => noteTabName("  ")).toThrow();
		expect(() => noteTabName("x".repeat(81))).toThrow();
		expect(noteTabName(" Mixing ")).toBe("Mixing");
		expect(parseSongTarget("http://%bad")).toBeNull();
		expect(parseSongTarget("/songs/%XX")).toBeNull();
	});
});
