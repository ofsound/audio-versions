// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptySettings } from "#/lib/audio-versions/types";
import { useAudioVersionsPlayback } from "./use-audio-versions-playback";

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
	afterEach(() => {
		closeSharedAudioContextMock.mockClear();
		recoverSharedAudioContextMock.mockClear();
		resumeSharedAudioContextMock.mockClear();
		subscribeToAudioEngineGenerationMock.mockClear();
	});

	it("resumes the shared context synchronously with the media play request", async () => {
		const snapshotRef = {
			current: {
				songs: [],
				audioFiles: [
					{
						id: "file-1",
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
});
