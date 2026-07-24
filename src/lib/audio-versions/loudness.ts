import type { LoudnessMetrics } from "./types";
import { withDecodedAudio } from "./waveform";

/** Offset that maps K-weighted mean square power onto the LUFS scale. */
const LUFS_OFFSET_DB = -0.691;
const ABSOLUTE_GATE_LUFS = -70;
const INTEGRATED_RELATIVE_GATE_LU = -10;
const RANGE_RELATIVE_GATE_LU = -20;
const RANGE_LOWER_PERCENTILE = 0.1;
const RANGE_UPPER_PERCENTILE = 0.95;
const SEGMENT_SECONDS = 0.1;
/** 400 ms momentary blocks advanced in 100 ms steps (75% overlap). */
const MOMENTARY_SEGMENTS = 4;
/** 3 s short-term blocks advanced in 100 ms steps. */
const SHORT_TERM_SEGMENTS = 30;
const SURROUND_CHANNEL_WEIGHT = 1.41;
const MINIMUM_DECIBELS = -120;

const SHELF_FREQUENCY_HZ = 1681.974450955533;
const SHELF_GAIN_DB = 3.999843853973347;
const SHELF_Q = 0.7071752369554196;
const HIGH_PASS_FREQUENCY_HZ = 38.13547087602444;
const HIGH_PASS_Q = 0.5003270373238773;

const TRUE_PEAK_OVERSAMPLE = 4;
const TRUE_PEAK_TAPS = 12;
/**
 * Inter-sample peaks of a band-limited signal stay within a few dB of the
 * sample peak, so oversampling only needs to run near the loudest samples.
 */
const TRUE_PEAK_CANDIDATE_RATIO = 0.5;

const STREAMING_TARGETS = [
	{ label: "Spotify, YouTube, Tidal, Amazon", targetLufs: -14 },
	{ label: "Deezer", targetLufs: -15 },
	{ label: "Apple Music", targetLufs: -16 },
];

interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

const TRUE_PEAK_PHASES = createTruePeakPhases();

export function measureLoudnessFromAudioBuffer(
	audioBuffer: AudioBuffer,
): LoudnessMetrics | null {
	const { length, numberOfChannels, sampleRate } = audioBuffer;
	if (!Number.isFinite(sampleRate) || sampleRate <= 0 || numberOfChannels < 1) {
		return null;
	}

	const segmentLength = Math.round(sampleRate * SEGMENT_SECONDS);
	const segmentCount = Math.floor(length / segmentLength);
	if (segmentCount < MOMENTARY_SEGMENTS) {
		return null;
	}

	const filters = createKWeightingFilters(sampleRate);
	const segmentPower = new Float64Array(segmentCount);
	let samplePeak = 0;
	let truePeak = 0;

	for (let channel = 0; channel < numberOfChannels; channel += 1) {
		const samples = audioBuffer.getChannelData(channel);
		const weight = getChannelWeight(channel, numberOfChannels);
		if (weight > 0) {
			addWeightedSegmentPower({
				filters,
				samples,
				segmentCount,
				segmentLength,
				target: segmentPower,
				weight,
			});
		}

		const channelSamplePeak = findSamplePeak(samples);
		samplePeak = Math.max(samplePeak, channelSamplePeak);
		truePeak = Math.max(truePeak, findTruePeak(samples, channelSamplePeak));
	}

	const integratedLufs = measureIntegratedLoudness(segmentPower, segmentLength);
	if (integratedLufs === null) {
		return null;
	}

	const shortTermPower = getBlockPower(
		segmentPower,
		segmentLength,
		SHORT_TERM_SEGMENTS,
	);
	const shortTermMaxLufs = shortTermPower.reduce(
		(maximum, power) => Math.max(maximum, powerToLoudness(power)),
		integratedLufs,
	);

	return {
		integratedLufs: roundMetric(integratedLufs),
		loudnessRangeLu: roundMetric(measureLoudnessRange(shortTermPower)),
		shortTermMaxLufs: roundMetric(shortTermMaxLufs),
		samplePeakDb: roundMetric(amplitudeToDecibels(samplePeak)),
		truePeakDb: roundMetric(amplitudeToDecibels(truePeak)),
	};
}

export async function measureLoudnessFromBlob(
	file: Blob,
): Promise<LoudnessMetrics | null> {
	return withDecodedAudio(file, measureLoudnessFromAudioBuffer);
}

export function normalizeLoudnessMetrics(
	value: Partial<LoudnessMetrics> | null | undefined,
): LoudnessMetrics | undefined {
	const integratedLufs = finiteOrNull(value?.integratedLufs);
	const truePeakDb = finiteOrNull(value?.truePeakDb);
	if (integratedLufs === null || truePeakDb === null) {
		return undefined;
	}

	return {
		integratedLufs,
		loudnessRangeLu: Math.max(0, finiteOrNull(value?.loudnessRangeLu) ?? 0),
		shortTermMaxLufs: finiteOrNull(value?.shortTermMaxLufs) ?? integratedLufs,
		samplePeakDb: finiteOrNull(value?.samplePeakDb) ?? truePeakDb,
		truePeakDb,
	};
}

/** Gain each streaming service applies when it normalizes to its own target. */
export function describeStreamingNormalization(integratedLufs: number): string {
	return STREAMING_TARGETS.map(({ label, targetLufs }) => {
		const deltaDb = targetLufs - integratedLufs;
		const sign = deltaDb > 0 ? "+" : "";
		return `${label} (${targetLufs} LUFS): ${sign}${deltaDb.toFixed(1)} dB`;
	}).join("\n");
}

function measureIntegratedLoudness(
	segmentPower: Float64Array,
	segmentLength: number,
): number | null {
	const momentaryPower = getBlockPower(
		segmentPower,
		segmentLength,
		MOMENTARY_SEGMENTS,
	);
	const absoluteGated = momentaryPower.filter(
		(power) => powerToLoudness(power) > ABSOLUTE_GATE_LUFS,
	);
	if (absoluteGated.length === 0) {
		return null;
	}

	const relativeGate =
		powerToLoudness(getMean(absoluteGated)) + INTEGRATED_RELATIVE_GATE_LU;
	const relativeGated = absoluteGated.filter(
		(power) => powerToLoudness(power) > relativeGate,
	);
	if (relativeGated.length === 0) {
		return null;
	}

	return powerToLoudness(getMean(relativeGated));
}

function measureLoudnessRange(shortTermPower: number[]): number {
	const absoluteGated = shortTermPower.filter(
		(power) => powerToLoudness(power) > ABSOLUTE_GATE_LUFS,
	);
	if (absoluteGated.length === 0) {
		return 0;
	}

	const relativeGate =
		powerToLoudness(getMean(absoluteGated)) + RANGE_RELATIVE_GATE_LU;
	const gatedLoudness = absoluteGated
		.map(powerToLoudness)
		.filter((loudness) => loudness > relativeGate)
		.sort((first, second) => first - second);
	if (gatedLoudness.length === 0) {
		return 0;
	}

	return Math.max(
		0,
		getPercentile(gatedLoudness, RANGE_UPPER_PERCENTILE) -
			getPercentile(gatedLoudness, RANGE_LOWER_PERCENTILE),
	);
}

/** Mean square power of every overlapping block, expressed in segment steps. */
function getBlockPower(
	segmentPower: Float64Array,
	segmentLength: number,
	blockSegments: number,
): number[] {
	if (segmentPower.length < blockSegments) {
		return [];
	}

	const blockSamples = blockSegments * segmentLength;
	const blocks: number[] = [];
	let windowSum = 0;
	for (let segment = 0; segment < blockSegments; segment += 1) {
		windowSum += segmentPower[segment];
	}
	blocks.push(windowSum / blockSamples);

	for (
		let segment = blockSegments;
		segment < segmentPower.length;
		segment += 1
	) {
		windowSum += segmentPower[segment] - segmentPower[segment - blockSegments];
		blocks.push(Math.max(0, windowSum) / blockSamples);
	}

	return blocks;
}

function addWeightedSegmentPower({
	filters,
	samples,
	segmentCount,
	segmentLength,
	target,
	weight,
}: {
	filters: [Biquad, Biquad];
	samples: Float32Array;
	segmentCount: number;
	segmentLength: number;
	target: Float64Array;
	weight: number;
}): void {
	const [shelf, highPass] = filters;
	let shelfInput1 = 0;
	let shelfInput2 = 0;
	let shelfOutput1 = 0;
	let shelfOutput2 = 0;
	let highPassInput1 = 0;
	let highPassInput2 = 0;
	let highPassOutput1 = 0;
	let highPassOutput2 = 0;

	for (let segment = 0; segment < segmentCount; segment += 1) {
		const start = segment * segmentLength;
		const end = start + segmentLength;
		let sum = 0;

		for (let index = start; index < end; index += 1) {
			const input = samples[index];
			const shelfOutput =
				shelf.b0 * input +
				shelf.b1 * shelfInput1 +
				shelf.b2 * shelfInput2 -
				shelf.a1 * shelfOutput1 -
				shelf.a2 * shelfOutput2;
			shelfInput2 = shelfInput1;
			shelfInput1 = input;
			shelfOutput2 = shelfOutput1;
			shelfOutput1 = shelfOutput;

			const highPassOutput =
				highPass.b0 * shelfOutput +
				highPass.b1 * highPassInput1 +
				highPass.b2 * highPassInput2 -
				highPass.a1 * highPassOutput1 -
				highPass.a2 * highPassOutput2;
			highPassInput2 = highPassInput1;
			highPassInput1 = shelfOutput;
			highPassOutput2 = highPassOutput1;
			highPassOutput1 = highPassOutput;

			sum += highPassOutput * highPassOutput;
		}

		target[segment] += weight * sum;
	}
}

/** BS.1770 weights the surround channels of a 5.x layout and skips the LFE. */
function getChannelWeight(channel: number, channelCount: number): number {
	if (channelCount < 5) {
		return 1;
	}

	if (channelCount >= 6 && channel === 3) {
		return 0;
	}

	return channel >= channelCount - 2 ? SURROUND_CHANNEL_WEIGHT : 1;
}

function createKWeightingFilters(sampleRate: number): [Biquad, Biquad] {
	const shelfK = Math.tan((Math.PI * SHELF_FREQUENCY_HZ) / sampleRate);
	const shelfGain = 10 ** (SHELF_GAIN_DB / 20);
	const shelfBandGain = shelfGain ** 0.4996667741545416;
	const shelfDenominator = 1 + shelfK / SHELF_Q + shelfK * shelfK;
	const shelf: Biquad = {
		b0:
			(shelfGain + (shelfBandGain * shelfK) / SHELF_Q + shelfK * shelfK) /
			shelfDenominator,
		b1: (2 * (shelfK * shelfK - shelfGain)) / shelfDenominator,
		b2:
			(shelfGain - (shelfBandGain * shelfK) / SHELF_Q + shelfK * shelfK) /
			shelfDenominator,
		a1: (2 * (shelfK * shelfK - 1)) / shelfDenominator,
		a2: (1 - shelfK / SHELF_Q + shelfK * shelfK) / shelfDenominator,
	};

	const highPassK = Math.tan((Math.PI * HIGH_PASS_FREQUENCY_HZ) / sampleRate);
	const highPassDenominator =
		1 + highPassK / HIGH_PASS_Q + highPassK * highPassK;
	const highPass: Biquad = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (highPassK * highPassK - 1)) / highPassDenominator,
		a2:
			(1 - highPassK / HIGH_PASS_Q + highPassK * highPassK) /
			highPassDenominator,
	};

	return [shelf, highPass];
}

function findSamplePeak(samples: Float32Array): number {
	let peak = 0;
	for (let index = 0; index < samples.length; index += 1) {
		const magnitude = Math.abs(samples[index]);
		if (magnitude > peak) {
			peak = magnitude;
		}
	}

	return peak;
}

function findTruePeak(samples: Float32Array, samplePeak: number): number {
	if (samplePeak <= 0) {
		return 0;
	}

	const threshold = samplePeak * TRUE_PEAK_CANDIDATE_RATIO;
	const center = TRUE_PEAK_TAPS / 2 - 1;
	let peak = samplePeak;

	for (let index = 0; index < samples.length; index += 1) {
		const isCandidate =
			Math.abs(samples[index]) >= threshold ||
			(index + 1 < samples.length && Math.abs(samples[index + 1]) >= threshold);
		if (!isCandidate) {
			continue;
		}

		for (let phase = 1; phase < TRUE_PEAK_OVERSAMPLE; phase += 1) {
			const taps = TRUE_PEAK_PHASES[phase];
			let value = 0;
			for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
				const sourceIndex = index - center + tap;
				if (sourceIndex >= 0 && sourceIndex < samples.length) {
					value += taps[tap] * samples[sourceIndex];
				}
			}

			const magnitude = Math.abs(value);
			if (magnitude > peak) {
				peak = magnitude;
			}
		}
	}

	return peak;
}

/** Windowed-sinc polyphase taps that reconstruct the intermediate samples. */
function createTruePeakPhases(): Float32Array[] {
	const center = TRUE_PEAK_TAPS / 2 - 1;

	return Array.from({ length: TRUE_PEAK_OVERSAMPLE }, (_phaseUnused, phase) => {
		const fraction = phase / TRUE_PEAK_OVERSAMPLE;
		const taps = new Float32Array(TRUE_PEAK_TAPS);
		let sum = 0;

		for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
			const window =
				0.42 -
				0.5 * Math.cos((2 * Math.PI * tap) / (TRUE_PEAK_TAPS - 1)) +
				0.08 * Math.cos((4 * Math.PI * tap) / (TRUE_PEAK_TAPS - 1));
			const value = sinc(tap - center - fraction) * window;
			taps[tap] = value;
			sum += value;
		}

		for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
			taps[tap] /= sum;
		}

		return taps;
	});
}

function sinc(value: number): number {
	if (Math.abs(value) < 1e-9) {
		return 1;
	}

	const scaled = Math.PI * value;
	return Math.sin(scaled) / scaled;
}

function powerToLoudness(power: number): number {
	return power > 0
		? LUFS_OFFSET_DB + 10 * Math.log10(power)
		: Number.NEGATIVE_INFINITY;
}

function amplitudeToDecibels(amplitude: number): number {
	return amplitude > 0
		? Math.max(MINIMUM_DECIBELS, 20 * Math.log10(amplitude))
		: MINIMUM_DECIBELS;
}

function getMean(values: number[]): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function getPercentile(sortedValues: number[], percentile: number): number {
	const index = Math.min(
		sortedValues.length - 1,
		Math.max(0, Math.round((sortedValues.length - 1) * percentile)),
	);
	return sortedValues[index];
}

function roundMetric(value: number): number {
	return Math.round(value * 100) / 100;
}

function finiteOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
