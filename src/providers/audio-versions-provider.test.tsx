// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import { createEmptySettings } from "#/lib/audio-versions/types";
import {
	AudioVersionsProvider,
	useAudioVersions,
} from "./audio-versions-provider";

const {
	deleteAnnotationMock,
	deleteAudioFileCascadeMock,
	deleteSongCascadeMock,
	loadSnapshotMock,
	saveAnnotationMock,
	saveAudioBlobMock,
	saveAudioFileMock,
	saveSettingsMock,
	saveSongMock,
} = vi.hoisted(() => ({
	deleteAnnotationMock: vi.fn(),
	deleteAudioFileCascadeMock: vi.fn(),
	deleteSongCascadeMock: vi.fn(),
	loadSnapshotMock: vi.fn(),
	saveAnnotationMock: vi.fn(),
	saveAudioBlobMock: vi.fn(),
	saveAudioFileMock: vi.fn(),
	saveSettingsMock: vi.fn(),
	saveSongMock: vi.fn(),
}));

vi.mock("#/lib/audio-versions/db", () => ({
	loadSnapshot: loadSnapshotMock,
	deleteAnnotation: deleteAnnotationMock,
	deleteAudioFileCascade: deleteAudioFileCascadeMock,
	deleteSongCascade: deleteSongCascadeMock,
	saveAnnotation: saveAnnotationMock,
	saveAudioBlob: saveAudioBlobMock,
	saveAudioFile: saveAudioFileMock,
	saveSettings: saveSettingsMock,
	saveSong: saveSongMock,
}));

function Probe() {
	const { ready, audioFiles } = useAudioVersions();

	return (
		<div data-testid="provider-state">
			{ready ? JSON.stringify(audioFiles) : "loading"}
		</div>
	);
}

function MutationProbe() {
	const {
		ready,
		settings,
		getSongById,
		getWorkspaceState,
		updateSong,
		updateUiSettings,
		updateWorkspaceState,
	} = useAudioVersions();
	const song = getSongById("song-1");
	const workspace = getWorkspaceState("song-1");

	return (
		<div>
			<div data-testid="mutation-state">
				{ready
					? JSON.stringify({
							title: song?.title,
							playheadMs: workspace.playheadMsByFileId["file-2"] ?? null,
							showArtist: settings.ui.showArtist,
						})
					: "loading"}
			</div>
			<button
				type="button"
				onClick={() => void updateSong("song-1", { title: "Updated title" })}
			>
				Update song
			</button>
			<button
				type="button"
				onClick={() =>
					void updateWorkspaceState("song-1", (current) => ({
						...current,
						playheadMsByFileId: {
							...current.playheadMsByFileId,
							"file-2": 123000,
						},
					}))
				}
			>
				Update workspace
			</button>
			<button
				type="button"
				onClick={() => void updateUiSettings({ showArtist: false })}
			>
				Hide artist
			</button>
		</div>
	);
}

function DeleteProbe() {
	const {
		ready,
		audioFiles,
		annotations,
		getSongById,
		getWorkspaceState,
		deleteAudioFile,
		deleteSong,
	} = useAudioVersions();
	const song = getSongById("song-1");
	const workspace = getWorkspaceState("song-1");

	return (
		<div>
			<div data-testid="delete-state">
				{ready
					? JSON.stringify({
							songId: song?.id ?? null,
							audioFileIds: audioFiles.map((audioFile) => audioFile.id),
							annotationIds: annotations.map((annotation) => annotation.id),
							playheadMs: workspace.playheadMsByFileId["file-1"] ?? null,
						})
					: "loading"}
			</div>
			<button type="button" onClick={() => void deleteAudioFile("file-1")}>
				Delete file
			</button>
			<button type="button" onClick={() => void deleteSong("song-1")}>
				Delete song
			</button>
		</div>
	);
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

describe("AudioVersionsProvider", () => {
	beforeEach(() => {
		loadSnapshotMock.mockReset();
		deleteAnnotationMock.mockReset();
		deleteAudioFileCascadeMock.mockReset();
		deleteSongCascadeMock.mockReset();
		saveAnnotationMock.mockReset();
		saveAudioBlobMock.mockReset();
		saveAudioFileMock.mockReset();
		saveSettingsMock.mockReset();
		saveSongMock.mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it("hydrates older audio records without volumeDb as 0 dB", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Legacy mix",
					sessionDate: "2026-04-16",
					notes: EMPTY_RICH_TEXT,
					durationMs: 180000,
					waveform: {
						peaks: [0.2, 0.6, 0.4],
						peakCount: 3,
						durationMs: 180000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			annotations: [],
			blobsByAudioId: {},
			settings: createEmptySettings(),
		});

		render(
			<AudioVersionsProvider>
				<Probe />
			</AudioVersionsProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("provider-state").textContent).toContain(
				'"volumeDb":0',
			);
		});
	});

	it("keeps overlapping mutations merged while persistence finishes in order", async () => {
		const saveSongDeferred = createDeferred();
		loadSnapshotMock.mockResolvedValue({
			songs: [
				{
					id: "song-1",
					title: "Initial title",
					artist: "Tester",
					project: "Album",
					generalNotes: EMPTY_RICH_TEXT,
					audioFileOrder: [],
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			audioFiles: [],
			annotations: [],
			blobsByAudioId: {},
			settings: {
				...createEmptySettings(),
				workspaceBySongId: {
					"song-1": {
						playheadMsByFileId: {},
						inspectorRatio: 0.56,
						lastVisitedAt: null,
					},
				},
			},
		});
		saveSongMock.mockImplementation(() => saveSongDeferred.promise);
		saveSettingsMock.mockResolvedValue(undefined);

		render(
			<AudioVersionsProvider>
				<MutationProbe />
			</AudioVersionsProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				"Initial title",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Update song" }));

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				"Updated title",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Update workspace" }));

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				'"playheadMs":123000',
			);
		});

		expect(saveSettingsMock).not.toHaveBeenCalled();

		saveSongDeferred.resolve();

		await waitFor(() => {
			expect(saveSongMock).toHaveBeenCalledTimes(1);
			expect(saveSettingsMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByTestId("mutation-state").textContent).toContain(
			'"title":"Updated title"',
		);
		expect(screen.getByTestId("mutation-state").textContent).toContain(
			'"playheadMs":123000',
		);
	});

	it("normalizes missing ui settings and persists ui updates", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [
				{
					id: "song-1",
					title: "Initial title",
					artist: "Tester",
					project: "Album",
					generalNotes: EMPTY_RICH_TEXT,
					audioFileOrder: [],
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			audioFiles: [],
			annotations: [],
			blobsByAudioId: {},
			settings: {
				recents: [],
				workspaceBySongId: {},
			},
		});
		saveSettingsMock.mockResolvedValue(undefined);

		render(
			<AudioVersionsProvider>
				<MutationProbe />
			</AudioVersionsProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				'"showArtist":true',
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Hide artist" }));

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				'"showArtist":false',
			);
		});
		await waitFor(() => {
			expect(saveSettingsMock).toHaveBeenCalledWith(
				expect.objectContaining({
					ui: expect.objectContaining({
						showArtist: false,
					}),
				}),
			);
		});
	});

	it("persists audio-file deletes through the atomic cascade helper", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [
				{
					id: "song-1",
					title: "Initial title",
					artist: "Tester",
					project: "Album",
					generalNotes: EMPTY_RICH_TEXT,
					audioFileOrder: ["file-1"],
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Take 1",
					notes: EMPTY_RICH_TEXT,
					volumeDb: 0,
					durationMs: 1000,
					waveform: {
						peaks: [0.2],
						peakCount: 1,
						durationMs: 1000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 100,
					title: "Cue",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			blobsByAudioId: {
				"file-1": new Blob(["wave"], { type: "audio/wav" }),
			},
			settings: {
				...createEmptySettings(),
				recents: [],
				lastOpenSongId: "song-1",
				workspaceBySongId: {
					"song-1": {
						playheadMsByFileId: {
							"file-1": 4500,
						},
						inspectorRatio: 0.56,
						lastVisitedAt: null,
					},
				},
			},
		});
		deleteAudioFileCascadeMock.mockResolvedValue(undefined);

		render(
			<AudioVersionsProvider>
				<DeleteProbe />
			</AudioVersionsProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("delete-state").textContent).toContain(
				'"file-1"',
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Delete file" }));

		await waitFor(() => {
			expect(deleteAudioFileCascadeMock).toHaveBeenCalledTimes(1);
		});

		expect(deleteAudioFileCascadeMock).toHaveBeenCalledWith({
			audioFileId: "file-1",
			annotationIds: ["annotation-1"],
			settings: {
				...createEmptySettings(),
				recents: [],
				lastOpenSongId: "song-1",
				workspaceBySongId: {
					"song-1": {
						playheadMsByFileId: {},
						inspectorRatio: 0.56,
						lastVisitedAt: null,
					},
				},
			},
			song: expect.objectContaining({
				id: "song-1",
				audioFileOrder: [],
			}),
		});

		expect(screen.getByTestId("delete-state").textContent).toContain(
			'"audioFileIds":[]',
		);
		expect(screen.getByTestId("delete-state").textContent).toContain(
			'"annotationIds":[]',
		);
	});

	it("persists song deletes through the atomic cascade helper", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [
				{
					id: "song-1",
					title: "Initial title",
					artist: "Tester",
					project: "Album",
					generalNotes: EMPTY_RICH_TEXT,
					audioFileOrder: ["file-1"],
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Take 1",
					notes: EMPTY_RICH_TEXT,
					volumeDb: 0,
					durationMs: 1000,
					waveform: {
						peaks: [0.2],
						peakCount: 1,
						durationMs: 1000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 100,
					title: "Cue",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			blobsByAudioId: {
				"file-1": new Blob(["wave"], { type: "audio/wav" }),
			},
			settings: {
				...createEmptySettings(),
				recents: ["song-1", "song-2"],
				lastOpenSongId: "song-1",
				workspaceBySongId: {
					"song-1": {
						playheadMsByFileId: {
							"file-1": 4500,
						},
						inspectorRatio: 0.56,
						lastVisitedAt: null,
					},
				},
			},
		});
		deleteSongCascadeMock.mockResolvedValue(undefined);

		render(
			<AudioVersionsProvider>
				<DeleteProbe />
			</AudioVersionsProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("delete-state").textContent).toContain(
				'"songId":"song-1"',
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Delete song" }));

		await waitFor(() => {
			expect(deleteSongCascadeMock).toHaveBeenCalledTimes(1);
		});

		expect(deleteSongCascadeMock).toHaveBeenCalledWith({
			songId: "song-1",
			audioFileIds: ["file-1"],
			annotationIds: ["annotation-1"],
			settings: {
				recents: ["song-2"],
				lastOpenSongId: "song-2",
				workspaceBySongId: {},
				ui: createEmptySettings().ui,
			},
		});

		expect(screen.getByTestId("delete-state").textContent).toContain(
			'"songId":null',
		);
	});
});
