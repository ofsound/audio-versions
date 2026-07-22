// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import type { Annotation, AudioFileRecord } from "#/lib/audio-versions/types";
import { WaveformCardAnnotationLayer } from "./waveform-card-annotation-layer";

const audioFile: AudioFileRecord = {
	id: "file-1",
	songId: "song-1",
	title: "Mix V1",
	sessionDate: "2026-04-16",
	notes: EMPTY_RICH_TEXT,
	volumeDb: 0,
	durationMs: 90000,
	createdAt: "2026-04-16T00:00:00.000Z",
	updatedAt: "2026-04-16T00:00:00.000Z",
	waveform: {
		peaks: [0.2, 0.4, 0.1],
		durationMs: 90000,
		sampleRate: 44100,
		peakCount: 3,
	},
};

function renderLayer(annotation: Annotation) {
	render(
		<div className="pointer-events-none relative h-48 w-96">
			<WaveformCardAnnotationLayer
				audioFile={audioFile}
				annotations={[annotation]}
				hoveredAnnotationRecord={null}
				hoveredTooltipPosition={null}
				onCommitAnnotationChange={vi.fn().mockResolvedValue(undefined)}
				onSeek={vi.fn().mockResolvedValue(undefined)}
				onSelectAnnotation={vi.fn()}
				onSelectFile={vi.fn()}
				onDeleteAnnotation={vi.fn().mockResolvedValue(undefined)}
				onPreviewAnnotationChange={vi.fn()}
				onResetAnnotationPreview={vi.fn()}
				getTimePerPixel={() => 1000}
				setHoveredAnnotation={vi.fn()}
				updateHoveredAnnotationPosition={vi.fn()}
			/>
		</div>,
	);
}

describe("WaveformCardAnnotationLayer", () => {
	afterEach(() => {
		cleanup();
	});

	it("restores pointer hit testing for point marker controls inside the overlay", () => {
		renderLayer({
			id: "annotation-1",
			songId: "song-1",
			audioFileId: "file-1",
			type: "point",
			startMs: 30000,
			title: "Verse",
			body: EMPTY_RICH_TEXT,
			color: "var(--color-marker-point)",
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-16T00:00:00.000Z",
		});

		expect(
			screen
				.getByRole("button", {
					name: /verse at 0:30/i,
				})
				.classList.contains("pointer-events-auto"),
		).toBe(true);
	});

	it("keeps the point marker hit area out of the bottom gutter region", () => {
		renderLayer({
			id: "annotation-1",
			songId: "song-1",
			audioFileId: "file-1",
			type: "point",
			startMs: 30000,
			title: "Verse",
			body: EMPTY_RICH_TEXT,
			color: "var(--color-marker-point)",
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-16T00:00:00.000Z",
		});

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerContainer = markerButton.parentElement;
		expect(markerContainer).toBeTruthy();
		expect(markerContainer?.className).toContain(
			"bottom-[var(--waveform-marker-gutter-height)]",
		);
		expect(markerContainer?.className).not.toMatch(/(^|\s)bottom-0(\s|$)/);
	});

	it("restores pointer hit testing for range controls inside the overlay", () => {
		renderLayer({
			id: "annotation-1",
			songId: "song-1",
			audioFileId: "file-1",
			type: "range",
			startMs: 30000,
			endMs: 45000,
			title: "Chorus",
			body: EMPTY_RICH_TEXT,
			color: "var(--color-marker-range)",
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-16T00:00:00.000Z",
		});

		const chorusHitTargets = screen.getAllByRole("button", {
			name: /chorus at 0:30 - 0:45/i,
		});
		expect(chorusHitTargets).toHaveLength(1);
		expect(
			chorusHitTargets.every((element) =>
				element.classList.contains("pointer-events-auto"),
			),
		).toBe(true);
		expect(
			document.querySelector("[data-range-waveform-highlight]"),
		).toBeTruthy();
		expect(
			document
				.querySelector("[data-range-waveform-highlight]")
				?.classList.contains("pointer-events-none"),
		).toBe(true);
		expect(
			screen
				.getByRole("button", {
					name: /adjust start of chorus/i,
				})
				.classList.contains("pointer-events-auto"),
		).toBe(true);
		expect(
			screen
				.getByRole("button", {
					name: /adjust end of chorus/i,
				})
				.classList.contains("pointer-events-auto"),
		).toBe(true);
	});
});
