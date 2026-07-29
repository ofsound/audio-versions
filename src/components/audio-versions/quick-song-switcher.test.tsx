// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "#/lib/audio-versions/types";
import { QuickSongSwitcher } from "./quick-song-switcher";

const navigateMock = vi.fn();
let songs: Song[] = [];

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready: true,
		settings: {
			recents: ["song-2", "song-1"],
		},
		songs,
	}),
}));

function makeSong(
	id: string,
	title: string,
	artist: string,
	project: string,
): Song {
	return {
		id,
		title,
		artist,
		project,
		generalNotes: "",
		audioFileOrder: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("QuickSongSwitcher", () => {
	beforeEach(() => {
		navigateMock.mockReset();
		songs = [
			makeSong("song-1", "Rain in May", "Ben", "Weather"),
			makeSong("song-2", "Midnight Choir", "Ada", "LP1"),
			makeSong("song-3", "Morning Light", "Ben", "Singles"),
		];
	});

	afterEach(() => {
		cleanup();
	});

	it("opens with Command-G and puts recent songs first", () => {
		render(<QuickSongSwitcher />);

		fireEvent.keyDown(window, { key: "g", metaKey: true });

		expect(screen.getByRole("dialog", { name: /quick open/i })).toBeTruthy();
		expect(
			screen.getAllByRole("option").map((option) => option.textContent),
		).toEqual([
			expect.stringContaining("Midnight Choir"),
			expect.stringContaining("Rain in May"),
			expect.stringContaining("Morning Light"),
		]);
	});

	it("narrows across song metadata and opens the keyboard selection", () => {
		render(<QuickSongSwitcher />);

		fireEvent.keyDown(window, { key: "g", metaKey: true });
		const input = screen.getByRole("textbox", { name: /search songs/i });
		fireEvent.change(input, { target: { value: "ben" } });

		expect(screen.getAllByRole("option")).toHaveLength(2);
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(navigateMock).toHaveBeenCalledWith({
			to: "/songs/$songId",
			params: { songId: "song-3" },
		});
		expect(screen.queryByRole("dialog", { name: /quick open/i })).toBeNull();
	});
});
