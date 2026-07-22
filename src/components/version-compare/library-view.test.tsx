// @vitest-environment jsdom

import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/version-compare/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	Song,
} from "#/lib/version-compare/types";
import { createDefaultUiSettings } from "#/lib/version-compare/types";
import { HeaderSlotsContext } from "./app-chrome";
import { LibraryView } from "./library-view";

const navigateMock = vi.fn();
const createSongMock = vi.fn();
const updateSongMock = vi.fn();
const deleteSongMock = vi.fn();
let songs: Song[] = [];
let audioFiles: AudioFileRecord[] = [];
let annotations: Annotation[] = [];
let uiSettings = createDefaultUiSettings();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/version-compare-provider", () => ({
	useVersionCompare: () => ({
		ready: true,
		error: null,
		songs,
		audioFiles,
		annotations,
		settings: {
			recents: [],
			workspaceBySongId: {},
			ui: uiSettings,
		},
		createSong: createSongMock,
		updateSong: updateSongMock,
		deleteSong: deleteSongMock,
	}),
}));

function makeSong(id: string): Song {
	return {
		id,
		title: "New Song",
		artist: "New Artist",
		project: "New Project",
		generalNotes: EMPTY_RICH_TEXT,
		audioFileOrder: [],
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
	};
}

function renderWithLibraryHeaderSlot(headerSlot: HTMLDivElement) {
	return render(
		<HeaderSlotsContext.Provider
			value={{
				library: { enabled: true, slot: headerSlot },
				song: { enabled: false, slot: null },
			}}
		>
			<LibraryView />
		</HeaderSlotsContext.Provider>,
	);
}

describe("LibraryView", () => {
	beforeEach(() => {
		navigateMock.mockReset();
		createSongMock.mockReset();
		updateSongMock.mockReset();
		deleteSongMock.mockReset();
		createSongMock.mockResolvedValue(makeSong("song-2"));
		songs = [];
		audioFiles = [];
		annotations = [];
		uiSettings = createDefaultUiSettings();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("renders create song as a header action and opens the modal on click", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		renderWithLibraryHeaderSlot(headerSlot);

		expect(screen.queryByRole("dialog", { name: /create song/i })).toBeNull();
		expect(screen.queryByLabelText(/song title/i)).toBeNull();
		expect(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		).toBeTruthy();

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);

		expect(
			screen.getByRole("dialog", {
				name: /create song/i,
			}),
		).toBeTruthy();
		expect(screen.getByLabelText(/song title/i)).toBeTruthy();
		expect(screen.getByLabelText(/^artist$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^project$/i)).toBeTruthy();
	});

	it("closes library modals on Escape", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];

		renderWithLibraryHeaderSlot(headerSlot);

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);
		expect(screen.getByRole("dialog", { name: /create song/i })).toBeTruthy();

		fireEvent.keyDown(screen.getByLabelText(/song title/i), { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /create song/i })).toBeNull();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /edit settings for new song/i }),
		);
		expect(screen.getByRole("dialog", { name: /song settings/i })).toBeTruthy();

		fireEvent.keyDown(screen.getByLabelText(/song title/i), { key: "Escape" });
		await waitFor(() => {
			expect(
				screen.queryByRole("dialog", { name: /song settings/i }),
			).toBeNull();
		});
	});

	it("submits the modal form and navigates to the created song", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		renderWithLibraryHeaderSlot(headerSlot);

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);

		fireEvent.change(screen.getByLabelText(/song title/i), {
			target: { value: "Midnight Choir" },
		});
		fireEvent.change(screen.getByLabelText(/^artist$/i), {
			target: { value: "Ada" },
		});
		fireEvent.change(screen.getByLabelText(/^project$/i), {
			target: { value: "LP1" },
		});
		const createSongDialog = screen.getByRole("dialog", {
			name: /create song/i,
		});
		fireEvent.click(
			within(createSongDialog).getByRole("button", { name: /^create song$/i }),
		);

		await waitFor(() => {
			expect(createSongMock).toHaveBeenCalledWith({
				title: "Midnight Choir",
				artist: "Ada",
				project: "LP1",
				generalNotes: EMPTY_RICH_TEXT,
			});
		});
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/songs/$songId",
				params: {
					songId: "song-2",
				},
			});
		});
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /create song/i })).toBeNull();
		});
	});

	it("does not show a journal placeholder for songs without notes", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];

		renderWithLibraryHeaderSlot(headerSlot);

		expect(
			screen.queryByText("Journal is ready for the first pass."),
		).toBeNull();
	});

	it("opens song settings from the title row and updates song metadata", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];
		updateSongMock.mockResolvedValue(undefined);

		renderWithLibraryHeaderSlot(headerSlot);

		expect(
			screen.queryByRole("button", { name: /delete new song/i }),
		).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /edit settings for new song/i }),
		);

		expect(
			screen.getByRole("dialog", {
				name: /song settings/i,
			}),
		).toBeTruthy();

		fireEvent.change(screen.getByLabelText(/song title/i), {
			target: { value: "Midnight Choir" },
		});
		fireEvent.change(screen.getByLabelText(/^artist$/i), {
			target: { value: "Ada" },
		});
		fireEvent.change(screen.getByLabelText(/^project$/i), {
			target: { value: "LP1" },
		});

		await waitFor(() => {
			expect(updateSongMock).toHaveBeenCalledWith("song-1", {
				title: "Midnight Choir",
			});
			expect(updateSongMock).toHaveBeenCalledWith("song-1", {
				artist: "Ada",
			});
			expect(updateSongMock).toHaveBeenCalledWith("song-1", {
				project: "LP1",
			});
		});
	});

	it("uses shared classes for the song card shell and inline settings button", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];

		renderWithLibraryHeaderSlot(headerSlot);

		const settingsButton = screen.getByRole("button", {
			name: /edit settings for new song/i,
		});
		const songCard = settingsButton.closest(".panel-shell");

		expect(songCard?.className).toContain("panel-shell-action");
		expect(settingsButton.className).toContain("icon-button");
	});

	it("shows the session date range next to files and markers on song cards", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];
		audioFiles = [
			{
				id: "audio-1",
				songId: "song-1",
				title: "Mix A",
				sessionDate: "2026-04-16",
				notes: EMPTY_RICH_TEXT,
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.1, 0.4, 0.2],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
			{
				id: "audio-2",
				songId: "song-1",
				title: "Mix B",
				sessionDate: "2026-06-02",
				notes: EMPTY_RICH_TEXT,
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.2, 0.5, 0.3],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-06-02T00:00:00.000Z",
				updatedAt: "2026-06-02T00:00:00.000Z",
			},
		];
		annotations = [
			{
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "audio-1",
				type: "point",
				startMs: 1000,
				title: "Downbeat",
				body: EMPTY_RICH_TEXT,
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
		];

		renderWithLibraryHeaderSlot(headerSlot);

		expect(screen.getByText("2 files")).toBeTruthy();
		expect(screen.getByText("1 markers")).toBeTruthy();
		expect(
			screen.getByText(
				`${new Date(2026, 3, 16).toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
				})} – ${new Date(2026, 5, 2).toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
				})}`,
			),
		).toBeTruthy();
	});

	it("confirms before deleting a song from the library song settings modal", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];
		audioFiles = [
			{
				id: "audio-1",
				songId: "song-1",
				title: "Mix A",
				sessionDate: "2026-04-16",
				notes: EMPTY_RICH_TEXT,
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.1, 0.4, 0.2],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
		];
		annotations = [
			{
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "audio-1",
				type: "point",
				startMs: 1000,
				title: "Downbeat",
				body: EMPTY_RICH_TEXT,
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
		];
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		renderWithLibraryHeaderSlot(headerSlot);

		fireEvent.click(
			screen.getByRole("button", { name: /edit settings for new song/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /^delete song$/i }));
		expect(confirmSpy).toHaveBeenCalledWith("Delete this song?");
		expect(deleteSongMock).not.toHaveBeenCalled();

		confirmSpy.mockReturnValue(true);
		fireEvent.click(screen.getByRole("button", { name: /^delete song$/i }));

		await waitFor(() => {
			expect(deleteSongMock).toHaveBeenCalledWith("song-1");
		});
	});

	it("hides artist and project fields when metadata visibility is disabled", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		uiSettings = {
			...uiSettings,
			showArtist: false,
			showProject: false,
		};
		songs = [makeSong("song-1")];

		renderWithLibraryHeaderSlot(headerSlot);

		expect(screen.queryByText("New Artist")).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /edit settings for new song/i }),
		);

		expect(screen.queryByLabelText(/^artist$/i)).toBeNull();
		expect(screen.queryByLabelText(/^project$/i)).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /close song settings/i }),
		);

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);

		expect(screen.queryByLabelText(/^artist$/i)).toBeNull();
		expect(screen.queryByLabelText(/^project$/i)).toBeNull();
	});
});
