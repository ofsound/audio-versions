import { describe, expect, it } from "vitest";
import {
	calculateWaveformThumbnailGridLayout,
	getWaveformThumbnailGridContentHeight,
} from "./waveform-thumbnail-grid-layout";

describe("calculateWaveformThumbnailGridLayout", () => {
	it("uses broad rows when a small collection has room", () => {
		const layout = calculateWaveformThumbnailGridLayout({
			height: 600,
			itemCount: 3,
			width: 800,
		});

		expect(layout).toMatchObject({
			columns: 1,
			density: "comfortable",
			rows: 3,
		});
		expect(
			layout ? getWaveformThumbnailGridContentHeight(layout) : 0,
		).toBeLessThan(600);
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
			density: "comfortable",
			rows: 6,
		});
	});

	it("keeps 36 items in two columns and scrolls instead of adding columns", () => {
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
			columns: 2,
			density: "comfortable",
			rows: 18,
		});
		expect(tallViewport).toMatchObject({
			columns: 2,
			density: "comfortable",
			rows: 18,
		});
		for (const [layout, height] of [
			[shortViewport, 400],
			[tallViewport, 700],
		] as const) {
			expect(layout?.rowHeightPx).toBeGreaterThanOrEqual(64);
			expect(
				layout ? getWaveformThumbnailGridContentHeight(layout) : 0,
			).toBeGreaterThan(height);
		}
	});

	it("preserves readable rows in a very short viewport", () => {
		expect(
			calculateWaveformThumbnailGridLayout({
				height: 120,
				itemCount: 36,
				width: 600,
			}),
		).toMatchObject({
			columns: 2,
			rowHeightPx: 64,
			density: "comfortable",
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
