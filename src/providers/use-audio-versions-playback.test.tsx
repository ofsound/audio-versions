// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySettings } from "#/lib/audio-versions/types";
import { useAudioVersionsPlayback } from "./use-audio-versions-playback";

const { getRemoteAudioUrlMock } = vi.hoisted(() => ({
	getRemoteAudioUrlMock: vi.fn(),
}));

vi.mock("#/lib/cloud/media", () => ({
	getRemoteAudioUrl: getRemoteAudioUrlMock,
}));

const {
	closeSharedAudioContextMock,
	recoverSharedAudioContextMock,
	resumeSharedAudioContextMock,
	subscribeToAudioEngineGenerationMock,
} = vi.hoisted(() => ({
	closeSharedAudioContextMock: vi.fn().mockResolvedValue(undefined),
	recoverSharedAudioContextMock: vi.fn().mockResolvedValue(undefined),
	resumeSharedAudioContextMock: vi.fn().mockResolvedValue(true),
	subscribeToAudioEngineGenerationMock: vi.fn(() => vi.fn()),
}));

vi.mock("#/lib/audio-versions/audio-engine", () => ({
	closeSharedAudioContext: closeSharedAudioContextMock,
	recoverSharedAudioContext: recoverSharedAudioContextMock,
	resumeSharedAudioContext: resumeSharedAudioContextMock,
	subscribeToAudioEngineGeneration: subscribeToAudioEngineGenerationMock,
}));

describe("useAudioVersionsPlayback", () => {
	beforeEach(() => {
		getRemoteAudioUrlMock
			.mockReset()
			.mockResolvedValue("https://media.example/fresh");
	});
	afterEach(() => {
		closeSharedAudioContextMock.mockClear();
		recoverSharedAudioContextMock.mockClear();
		resumeSharedAudioContextMock.mockClear();
		subscribeToAudioEngineGenerationMock.mockClear();
	});

	function setup(remote = false) {
		const snapshotRef = {
			current: {
				songs: [],
				audioFiles: [
					{
						id: "file-1",
						...(remote
							? {
									remoteMedia: {
										pathname: "mix.mp3",
										contentType: "audio/mpeg",
										size: 100,
										originalName: "mix.mp3",
									},
								}
							: {}),
						songId: "song-1",
						title: "Mix",
						sessionDate: "2026-07-21",
						notes: { type: "doc" as const, content: [] },
						volumeDb: 0,
						durationMs: 10_000,
						waveform: {
							peaks: [0.25],
							peakCount: 1,
							durationMs: 10_000,
							sampleRate: 44_100,
						},
						createdAt: "2026-07-21T00:00:00.000Z",
						updatedAt: "2026-07-21T00:00:00.000Z",
					},
				],
				annotations: [],
				playlists: [],
				blobsByAudioId: {},
				settings: createEmptySettings(),
			},
		};
		const { result, unmount } = renderHook(() =>
			useAudioVersionsPlayback({
				getAnnotationsForFile: () => [],
				getWorkspaceState: () => ({
					playheadMsByFileId: {},
					inspectorRatio: 0.56,
					lastVisitedAt: null,
				}),
				snapshotRef,
			}),
		);
		const element = document.createElement("audio");
		const playMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(element, "play", {
			configurable: true,
			value: playMock,
		});

		const loadMock = vi.fn();
		Object.defineProperty(element, "load", { value: loadMock });
		element.src = remote ? "https://media.example/expired" : "blob:local";
		return { result, unmount, element, playMock, loadMock };
	}

	it("resumes the shared context synchronously with the media play request", async () => {
		const { result, unmount, element, playMock } = setup();
		act(() => {
			result.current.registerAudioElement("file-1", element);
		});
		await act(async () => {
			await result.current.togglePlayback("file-1");
		});

		expect(resumeSharedAudioContextMock).toHaveBeenCalledTimes(1);
		expect(playMock).toHaveBeenCalledTimes(1);
		expect(
			resumeSharedAudioContextMock.mock.invocationCallOrder[0],
		).toBeLessThan(playMock.mock.invocationCallOrder[0] ?? 0);
		expect(result.current.playback.isPlaying).toBe(true);

		unmount();
		expect(closeSharedAudioContextMock).toHaveBeenCalledTimes(1);
	});
	it("refreshes an idle player's private link and preserves its position", async () => {
		const { result, unmount, element, loadMock } = setup(true);
		element.currentTime = 6;
		act(() => result.current.registerAudioElement("file-1", element));
		await act(async () => result.current.togglePlayback("file-1"));
		expect(element.src).toBe("https://media.example/fresh");
		expect(element.currentTime).toBe(6);
		expect(loadMock).toHaveBeenCalledOnce();
		expect(result.current.playback.isPlaying).toBe(true);
		unmount();
	});

	it("refreshes a private link before seeking", async () => {
		const { result, unmount, element } = setup(true);
		act(() => result.current.registerAudioElement("file-1", element));
		await act(async () => result.current.seekFile("file-1", 8000));
		expect(element.src).toBe("https://media.example/fresh");
		expect(element.currentTime).toBe(8);
		unmount();
	});

	it("retries a rejected media link once with a new signature", async () => {
		const { result, unmount, element, playMock } = setup(true);
		Object.defineProperty(element, "error", { value: { code: 2 } });
		playMock.mockRejectedValueOnce(new Error("Media could not load"));
		act(() => result.current.registerAudioElement("file-1", element));
		await act(async () => result.current.togglePlayback("file-1"));
		expect(getRemoteAudioUrlMock).toHaveBeenLastCalledWith("file-1", true);
		expect(playMock).toHaveBeenCalledTimes(2);
		unmount();
	});

	it("stops retrying if the refreshed media also fails", async () => {
		const { result, unmount, element, playMock } = setup(true);
		Object.defineProperty(element, "error", { value: { code: 2 } });
		playMock.mockRejectedValue(new Error("Media could not load"));
		act(() => result.current.registerAudioElement("file-1", element));
		await act(async () => result.current.togglePlayback("file-1"));
		expect(playMock).toHaveBeenCalledTimes(2);
		expect(result.current.playback.isPlaying).toBe(false);
		unmount();
	});

	it("keeps local cached media independent of cloud availability", async () => {
		const { result, unmount, element } = setup(true);
		element.src = "blob:cached";
		act(() => result.current.registerAudioElement("file-1", element));
		await act(async () => result.current.togglePlayback("file-1"));
		expect(getRemoteAudioUrlMock).not.toHaveBeenCalled();
		expect(result.current.playback.isPlaying).toBe(true);
		unmount();
	});
});
