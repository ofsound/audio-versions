import { describe, expect, it } from "vitest";
import { buildSongTargetPath, parseSongTarget } from "./links";
import { findCrossedAnnotation } from "./playback";
import {
	EMPTY_RICH_TEXT,
	plainTextToRichText,
	richTextToPlainText,
} from "./rich-text";
import { searchAudioVersions } from "./search";
import type { Annotation, AudioFileRecord, Song } from "./types";
import { createDefaultUiSettings } from "./types";
import {
	hasRenderableWaveform,
	normalizeVolumeDb,
	normalizeWaveformData,
	volumeDbToGain,
} from "./waveform";

describe("audio versions rich text", () => {
	it("converts paragraphs into searchable plain text", () => {
		const doc = plainTextToRichText("First line\nSecond line\n\nBridge idea");

		expect(richTextToPlainText(doc)).toBe("First line Second line Bridge idea");
		expect(richTextToPlainText(EMPTY_RICH_TEXT)).toBe("");
	});
});

describe("audio versions links", () => {
	it("builds and parses deep links for file annotations", () => {
		const href = buildSongTargetPath({
			songId: "song-1",
			fileId: "file-3",
			annotationId: "annotation-9",
			timeMs: 42500,
			autoplay: true,
		});

		expect(href).toBe(
			"/songs/song-1?fileId=file-3&annotationId=annotation-9&timeMs=42500&autoplay=1",
		);
		expect(parseSongTarget(href)).toEqual({
			songId: "song-1",
			fileId: "file-3",
			annotationId: "annotation-9",
			timeMs: 42500,
			autoplay: true,
		});
	});
});

describe("audio versions playback marker crossing", () => {
	const annotations: Annotation[] = [
		{
			id: "annotation-1",
			songId: "song-1",
			audioFileId: "file-1",
			type: "point",
			startMs: 1000,
			detail: plainTextToRichText("Intro"),
			createdAt: "2026-04-15T00:00:00.000Z",
			updatedAt: "2026-04-15T00:00:00.000Z",
		},
		{
			id: "annotation-2",
			songId: "song-1",
			audioFileId: "file-1",
			type: "range",
			startMs: 3000,
			endMs: 5000,
			detail: plainTextToRichText("Verse"),
			createdAt: "2026-04-15T00:00:00.000Z",
			updatedAt: "2026-04-15T00:00:00.000Z",
		},
		{
			id: "annotation-3",
			songId: "song-1",
			audioFileId: "file-1",
			type: "point",
			startMs: 6000,
			detail: plainTextToRichText("Hook"),
			createdAt: "2026-04-15T00:00:00.000Z",
			updatedAt: "2026-04-15T00:00:00.000Z",
		},
	];

	it("detects a forward crossing when the playhead lands on a marker", () => {
		expect(findCrossedAnnotation(annotations, 500, 1000)?.id).toBe(
			"annotation-1",
		);
	});

	it("detects a backward crossing when the playhead lands on a marker", () => {
		expect(findCrossedAnnotation(annotations, 6500, 6000)?.id).toBe(
			"annotation-3",
		);
	});

	it("does not report a crossing when the playhead stays within the same interval", () => {
		expect(findCrossedAnnotation(annotations, 1100, 2900)).toBeUndefined();
		expect(findCrossedAnnotation(annotations, 2900, 1100)).toBeUndefined();
	});

	it("chooses the most recently crossed marker in the direction of travel", () => {
		expect(findCrossedAnnotation(annotations, 500, 6100)?.id).toBe(
			"annotation-3",
		);
		expect(findCrossedAnnotation(annotations, 6500, 900)?.id).toBe(
			"annotation-1",
		);
	});

	it("uses the range start instead of the range end for crossings", () => {
		expect(findCrossedAnnotation(annotations, 2500, 3200)?.id).toBe(
			"annotation-2",
		);
		expect(findCrossedAnnotation(annotations, 5001, 4500)).toBeUndefined();
	});
});

describe("audio versions search", () => {
	it("finds song, journal, file, and annotation matches", () => {
		const songs: Song[] = [
			{
				id: "song-1",
				title: "Midnight Choir",
				artist: "Northline",
				project: "LP1",
				generalNotes: "Need more lift in the chorus",
				audioFileOrder: ["file-1"],
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const audioFiles: AudioFileRecord[] = [
			{
				id: "file-1",
				songId: "song-1",
				title: "Mix v4",
				sessionDate: "2026-04-15",
				notes: plainTextToRichText("Snare still feels dark"),
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.2, 0.8, 0.4],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const annotations: Annotation[] = [
			{
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "file-1",
				type: "point",
				startMs: 54200,
				detail: plainTextToRichText("Snare transient needs more crack here"),
				color: "var(--color-marker-point)",
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const chorusResults = searchAudioVersions(
			{ songs, audioFiles, annotations },
			"chorus",
			createDefaultUiSettings(),
		);
		const snareResults = searchAudioVersions(
			{ songs, audioFiles, annotations },
			"snare",
			createDefaultUiSettings(),
		);

		expect(chorusResults.some((result) => result.type === "song")).toBe(true);
		expect(chorusResults.some((result) => result.type === "journal")).toBe(
			true,
		);
		expect(snareResults.some((result) => result.type === "file")).toBe(true);
		expect(snareResults.some((result) => result.type === "annotation")).toBe(
			true,
		);
		expect(
			snareResults.find((result) => result.type === "annotation")?.target
				.timeMs,
		).toBe(54200);
	});
});

describe("audio versions waveform normalization", () => {
	it("filters invalid peaks and falls back to a renderable flat waveform", () => {
		expect(
			normalizeWaveformData(
				{
					peaks: [0.25, Number.NaN, -1, 4],
					peakCount: 4,
					durationMs: 1250,
					sampleRate: 48000,
				},
				500,
			),
		).toEqual({
			peaks: [0.25, 0, 1],
			peakCount: 3,
			durationMs: 1250,
			sampleRate: 48000,
		});

		const fallback = normalizeWaveformData(
			{
				peaks: [],
				peakCount: 0,
				durationMs: 0,
				sampleRate: 0,
			},
			2200,
		);

		expect(fallback.durationMs).toBe(2200);
		expect(fallback.sampleRate).toBe(44100);
		expect(fallback.peaks.length).toBeGreaterThan(0);
		expect(fallback.peaks.every((value) => value === 0)).toBe(true);
	});

	it("detects whether a stored waveform can be rendered", () => {
		expect(hasRenderableWaveform({ peaks: [0, 0.4] })).toBe(true);
		expect(hasRenderableWaveform({ peaks: [Number.NaN] })).toBe(false);
		expect(hasRenderableWaveform({ peaks: [] })).toBe(false);
	});
});

describe("audio versions volume normalization", () => {
	it("defaults invalid values to 0 dB", () => {
		expect(normalizeVolumeDb(undefined)).toBe(0);
		expect(normalizeVolumeDb(Number.NaN)).toBe(0);
	});

	it("rounds to the nearest whole decibel and clamps to the supported range", () => {
		expect(normalizeVolumeDb(2.6)).toBe(3);
		expect(normalizeVolumeDb(-1.6)).toBe(-2);
		expect(normalizeVolumeDb(99)).toBe(12);
		expect(normalizeVolumeDb(-99)).toBe(-12);
	});

	it("converts decibels into linear gain", () => {
		expect(volumeDbToGain(0)).toBe(1);
		expect(volumeDbToGain(6)).toBeCloseTo(1.995, 3);
		expect(volumeDbToGain(-6)).toBeCloseTo(0.501, 3);
	});
});
