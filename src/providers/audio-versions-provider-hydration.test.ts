import { describe, expect, it } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import {
	type AudioVersionsSnapshot,
	createEmptySettings,
} from "#/lib/audio-versions/types";
import { normalizeLoadedSnapshot } from "./audio-versions-provider-hydration";

describe("normalizeLoadedSnapshot", () => {
	it("backfills missing session dates from createdAt during hydration", async () => {
		const snapshot = {
			songs: [],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Take 1",
					notes: EMPTY_RICH_TEXT,
					volumeDb: 0,
					durationMs: 180000,
					waveform: {
						peaks: [0.2, 0.6, 0.4],
						peakCount: 3,
						durationMs: 180000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:00.000Z",
				},
			],
			annotations: [],
			blobsByAudioId: {},
			settings: createEmptySettings(),
		} as unknown as AudioVersionsSnapshot;

		const { normalizedSnapshot } = await normalizeLoadedSnapshot(snapshot);

		expect(normalizedSnapshot.audioFiles).toEqual([
			expect.objectContaining({
				id: "file-1",
				sessionDate: "2026-04-18",
			}),
		]);
	});
});
