import { describe, expect, it } from "vitest";
import { calculateWaveformThumbnailGridLayout } from "./waveform-thumbnail-grid-layout";

describe("calculateWaveformThumbnailGridLayout", () => {
	it("uses broad rows when a small collection has room", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 400,
				itemCount: 3,
				width: 800,
			}),
		).toMatchObject({
			columns: 1,
			density: "comfortable",
			rows: 3,
		});
	});

	it("adds columns to keep a medium collection large", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 400,
				itemCount: 12,
				width: 800,
			}),
		).toMatchObject({
			columns: 2,
			density: "compact",
			rows: 6,
		});
	});

	it("fits 36 items without overflow and adapts columns to height", () => {
		const shortViewport = calculateWaveformThumbnailGridLayout({
			height: 400,
			itemCount: 36,
			width: 800,
		});
		const tallViewport = calculateWaveformThumbnailGridLayout({
			height: 700,
			itemCount: 36,
			width: 800,
		});

		expect(shortViewport).toMatchObject({
			columns: 4,
			density: "compact",
			rows: 9,
		});
		expect(tallViewport).toMatchObject({
			columns: 3,
			density: "compact",
			rows: 12,
		});
		expect(
			(shortViewport?.rowHeightPx ?? 0) * (shortViewport?.rows ?? 0) +
				(shortViewport?.gapPx ?? 0) * ((shortViewport?.rows ?? 0) - 1),
		).toBeLessThanOrEqual(400);
	});

	it("falls back to a compressed treatment in a very short viewport", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 120,
				itemCount: 36,
				width: 600,
			}),
		).toMatchObject({
			density: "compressed",
		});
	});

	it("never exceeds the file-player waveform height cap", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 800,
				itemCount: 2,
				maxRowHeightPx: 92,
				width: 900,
			}),
		).toMatchObject({
			rowHeightPx: 92,
		});
	});

	it("returns no layout for an unmeasurable viewport", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 0,
				itemCount: 12,
				width: 800,
			}),
		).toBeNull();
	});
});
