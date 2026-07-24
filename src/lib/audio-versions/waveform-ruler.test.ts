import { describe, expect, it } from "vitest";
import {
	buildWaveformRulerTicks,
	formatWaveformRulerLabel,
} from "./waveform-ruler";

describe("formatWaveformRulerLabel", () => {
	it("formats sub-hour times as M:SS", () => {
		expect(formatWaveformRulerLabel(0, 180_000)).toBe("0:00");
		expect(formatWaveformRulerLabel(65_000, 180_000)).toBe("1:05");
	});

	it("formats hour-plus tracks as H:MM:SS", () => {
		expect(formatWaveformRulerLabel(3_665_000, 4_000_000)).toBe("1:01:05");
	});

	it("includes a fractional second for non-whole times", () => {
		expect(formatWaveformRulerLabel(500, 5_000)).toBe("0:00.5");
	});
});

describe("buildWaveformRulerTicks", () => {
	it("returns no ticks for unmeasurable input", () => {
		expect(
			buildWaveformRulerTicks({
				durationMs: 0,
				widthPx: 800,
			}),
		).toEqual([]);
		expect(
			buildWaveformRulerTicks({
				durationMs: 60_000,
				widthPx: 0,
			}),
		).toEqual([]);
	});

	it("uses finer majors for short tracks and wider canvases", () => {
		const ticks = buildWaveformRulerTicks({
			durationMs: 30_000,
			widthPx: 900,
		});
		const majors = ticks.filter((tick) => tick.kind === "major");

		expect(majors.map((tick) => tick.timeMs)).toEqual([
			0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000,
		]);
		expect(majors[1]?.label).toBe("0:05");
		expect(ticks.some((tick) => tick.kind === "minor")).toBe(true);
	});

	it("coarsens majors for long tracks", () => {
		const ticks = buildWaveformRulerTicks({
			durationMs: 30 * 60_000,
			widthPx: 800,
		});
		const majorTimes = ticks
			.filter((tick) => tick.kind === "major")
			.map((tick) => tick.timeMs);

		expect(majorTimes[0]).toBe(0);
		expect(majorTimes[1]).toBeGreaterThanOrEqual(60_000);
		expect(majorTimes.at(-1)).toBeLessThanOrEqual(30 * 60_000);
	});

	it("omits the final major label when it would clip the right edge", () => {
		const ticks = buildWaveformRulerTicks({
			durationMs: 30_000,
			widthPx: 200,
		});
		const lastMajor = [...ticks]
			.reverse()
			.find((tick) => tick.kind === "major");

		expect(lastMajor?.timeMs).toBeGreaterThan(0);
		expect(lastMajor?.label).toBeUndefined();
	});

	it("places four minor ticks between five-second majors", () => {
		const ticks = buildWaveformRulerTicks({
			durationMs: 10_000,
			widthPx: 400,
		});
		const between = ticks.filter(
			(tick) => tick.timeMs > 0 && tick.timeMs < 5_000,
		);

		expect(between).toHaveLength(4);
		expect(between.every((tick) => tick.kind === "minor")).toBe(true);
	});
});
