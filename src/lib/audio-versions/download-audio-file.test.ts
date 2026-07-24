import { describe, expect, it } from "vitest";
import {
	extensionForAudioBlob,
	resolveAudioDownloadFilename,
} from "./download-audio-file";
import { EMPTY_RICH_TEXT } from "./rich-text";
import type { AudioFileRecord } from "./types";

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: "song-1",
		title: "Mix v1",
		sessionDate: "2026-04-16",
		notes: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 180000,
		waveform: {
			peaks: [0.2, 0.6, 0.4],
			peakCount: 3,
			durationMs: 180000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

describe("download-audio-file helpers", () => {
	it("derives an extension from the blob mime type", () => {
		expect(extensionForAudioBlob(new Blob([], { type: "audio/wav" }))).toBe(
			"wav",
		);
		expect(extensionForAudioBlob(new Blob([], { type: "audio/x-aiff" }))).toBe(
			"aiff",
		);
	});

	it("prefers the original remote filename when present", () => {
		expect(
			resolveAudioDownloadFilename(
				createAudioFile({
					remoteMedia: {
						pathname: "users/1/audio/file-1/mix.aiff",
						contentType: "audio/aiff",
						size: 1024,
						originalName: "High Plains Drifter v16.aiff",
					},
				}),
			),
		).toBe("High Plains Drifter v16.aiff");
	});

	it("falls back to the title plus blob extension", () => {
		expect(
			resolveAudioDownloadFilename(
				createAudioFile({ title: "Mix Print" }),
				new Blob([], { type: "audio/wav" }),
			),
		).toBe("Mix Print.wav");
	});
});
