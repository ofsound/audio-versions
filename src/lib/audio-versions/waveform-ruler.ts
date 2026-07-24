type WaveformRulerTickKind = "major" | "minor";

interface WaveformRulerTick {
	kind: WaveformRulerTickKind;
	/** Label for major ticks only. */
	label?: string;
	timeMs: number;
}

interface BuildWaveformRulerTicksOptions {
	durationMs: number;
	/** Measured ruler width in CSS pixels. */
	widthPx: number;
	/** Target horizontal spacing between major labels. */
	targetMajorSpacingPx?: number;
}

/** Nice major intervals, shortest first (ms). */
const NICE_MAJOR_INTERVALS_MS = [
	100, 200, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000,
	300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 10_800_000,
	21_600_000,
] as const;

const DEFAULT_TARGET_MAJOR_SPACING_PX = 84;
const MIN_MAJOR_SPACING_PX = 56;
/** Approximate major-label width used to avoid clipping at the right edge. */
const ESTIMATED_LABEL_WIDTH_PX = 44;

function chooseMinorIntervalMs(majorIntervalMs: number): number {
	if (majorIntervalMs % 5 === 0) {
		return majorIntervalMs / 5;
	}
	if (majorIntervalMs % 4 === 0) {
		return majorIntervalMs / 4;
	}
	return majorIntervalMs / 2;
}

function chooseMajorIntervalMs(
	durationMs: number,
	widthPx: number,
	targetMajorSpacingPx: number,
): number {
	const safeDurationMs = Math.max(durationMs, 1);
	const safeWidthPx = Math.max(widthPx, 1);
	const idealIntervalMs = (targetMajorSpacingPx / safeWidthPx) * safeDurationMs;

	for (const candidate of NICE_MAJOR_INTERVALS_MS) {
		const spacingPx = (candidate / safeDurationMs) * safeWidthPx;
		if (candidate >= idealIntervalMs && spacingPx >= MIN_MAJOR_SPACING_PX) {
			return candidate;
		}
	}

	return (
		NICE_MAJOR_INTERVALS_MS[NICE_MAJOR_INTERVALS_MS.length - 1] ?? 3_600_000
	);
}

/**
 * Formats a ruler label. Uses M:SS under an hour and H:MM:SS at/above.
 * Non-whole-second times include a single fractional second digit.
 */
export function formatWaveformRulerLabel(
	timeMs: number,
	durationMs: number,
): string {
	const clampedMs = Math.max(0, Math.round(timeMs));
	const showHours = durationMs >= 3_600_000;

	if (clampedMs % 1000 !== 0) {
		const totalSeconds = clampedMs / 1000;
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const secondsLabel = seconds.toFixed(1).padStart(4, "0");
		if (showHours) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${secondsLabel}`;
		}
		return `${minutes}:${secondsLabel}`;
	}

	const totalSeconds = Math.floor(clampedMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (showHours) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildWaveformRulerTicks({
	durationMs,
	widthPx,
	targetMajorSpacingPx = DEFAULT_TARGET_MAJOR_SPACING_PX,
}: BuildWaveformRulerTicksOptions): WaveformRulerTick[] {
	if (durationMs <= 0 || widthPx <= 0) {
		return [];
	}

	const majorIntervalMs = chooseMajorIntervalMs(
		durationMs,
		widthPx,
		targetMajorSpacingPx,
	);
	const minorIntervalMs = chooseMinorIntervalMs(majorIntervalMs);
	const minorStepsPerMajor = Math.round(majorIntervalMs / minorIntervalMs);
	const ticks: WaveformRulerTick[] = [];
	const maxLabeledTimeMs = Math.max(
		0,
		durationMs - ((ESTIMATED_LABEL_WIDTH_PX / widthPx) * durationMs) / 2,
	);
	const stepCount = Math.floor(durationMs / minorIntervalMs + 1e-9);

	for (let step = 0; step <= stepCount; step += 1) {
		const timeMs = step * minorIntervalMs;
		if (timeMs > durationMs) {
			break;
		}

		const isMajor = step % minorStepsPerMajor === 0;
		if (!isMajor) {
			ticks.push({
				kind: "minor",
				timeMs,
			});
			continue;
		}

		ticks.push({
			kind: "major",
			label:
				timeMs <= maxLabeledTimeMs
					? formatWaveformRulerLabel(timeMs, durationMs)
					: undefined,
			timeMs,
		});
	}

	return ticks;
}
