// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "#/lib/audio-versions/types";
import { TrashView } from "./trash-view";

const restoreSongMock = vi.fn();
const permanentlyDeleteSongMock = vi.fn();
let ready = true;
let trashedSongs: Song[] = [];

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready,
		trashedSongs,
		restoreSong: restoreSongMock,
		permanentlyDeleteSong: permanentlyDeleteSongMock,
	}),
}));

function makeSong(id: string): Song {
	return {
		id,
		title: "New Song",
		artist: "",
		project: "",
		generalNotes: "",
		audioFileOrder: [],
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		deletedAt: "2026-07-20T00:00:00.000Z",
	};
}

describe("TrashView", () => {
	beforeEach(() => {
		ready = true;
		trashedSongs = [];
		restoreSongMock.mockReset();
		permanentlyDeleteSongMock.mockReset();
	});

	afterEach(cleanup);

	it("shows an empty state", () => {
		render(<TrashView />);

		expect(screen.getByRole("heading", { name: "Trash" })).toBeTruthy();
		expect(screen.getByText("Trash is empty.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /empty trash/i })).toBeNull();
	});

	it("restores songs and confirms permanent deletion", async () => {
		trashedSongs = [makeSong("song-1")];
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<TrashView />);

		fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));
		await waitFor(() => {
			expect(restoreSongMock).toHaveBeenCalledWith("song-1");
		});

		fireEvent.click(
			screen.getByRole("button", { name: /^delete permanently$/i }),
		);
		expect(permanentlyDeleteSongMock).not.toHaveBeenCalled();

		confirmSpy.mockReturnValue(true);
		fireEvent.click(
			screen.getByRole("button", { name: /^delete permanently$/i }),
		);
		await waitFor(() => {
			expect(permanentlyDeleteSongMock).toHaveBeenCalledWith("song-1");
		});
	});
});
