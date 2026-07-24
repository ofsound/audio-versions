import { describe, expect, it } from "vitest";
import {
	describeStreamingNormalization,
	measureLoudnessFromAudioBuffer,
	normalizeLoudnessMetrics,
} from "./loudness";

const SAMPLE_RATE = 48000;

function createAudioBuffer(channels: Float32Array[]): AudioBuffer {
	return {
		length: channels[0]?.length ?? 0,
		numberOfChannels: channels.length,
		sampleRate: SAMPLE_RATE,
		getChannelData: (channel: number) => channels[channel],
	} as unknown as AudioBuffer;
}

function createTone({
	amplitude = 1,
	frequency = 1000,
	seconds = 5,
	phase = 0,
}: {
	amplitude?: number;
	frequency?: number;
	seconds?: number;
	phase?: number;
} = {}): Float32Array {
	const samples = new Float32Array(Math.round(SAMPLE_RATE * seconds));
	for (let index = 0; index < samples.length; index += 1) {
		samples[index] =
			amplitude *
			Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE + phase);
	}

	return samples;
}

function concatenate(...segments: Float32Array[]): Float32Array {
	const total = segments.reduce((sum, segment) => sum + segment.length, 0);
	const combined = new Float32Array(total);
	let offset = 0;
	for (const segment of segments) {
		combined.set(segment, offset);
		offset += segment.length;
	}

	return combined;
}

describe("measureLoudnessFromAudioBuffer", () => {
	it("reads a full-scale stereo 1 kHz sine as 0 LUFS", () => {
		const tone = createTone();
		const metrics = measureLoudnessFromAudioBuffer(
			createAudioBuffer([tone, tone]),
		);

		expect(metrics?.integratedLufs).toBeCloseTo(0, 1);
	});

	it("sums channels so a single channel reads 3 LU quieter than dual mono", () => {
		const tone = createTone();
		const mono = measureLoudnessFromAudioBuffer(createAudioBuffer([tone]));
		const stereo = measureLoudnessFromAudioBuffer(
			createAudioBuffer([tone, tone]),
		);

		expect(
			(stereo?.integratedLufs ?? 0) - (mono?.integratedLufs ?? 0),
		).toBeCloseTo(3.01, 1);
	});

	it("tracks amplitude changes decibel for decibel", () => {
		const loud = measureLoudnessFromAudioBuffer(
			createAudioBuffer([createTone({ amplitude: 1 })]),
		);
		const quiet = measureLoudnessFromAudioBuffer(
			createAudioBuffer([createTone({ amplitude: 0.5 })]),
		);

		expect(
			(loud?.integratedLufs ?? 0) - (quiet?.integratedLufs ?? 0),
		).toBeCloseTo(6.02, 1);
	});

	it("gates silence out of the integrated measurement", () => {
		const tone = createTone({ amplitude: 0.5, seconds: 10 });
		const withoutSilence = measureLoudnessFromAudioBuffer(
			createAudioBuffer([tone]),
		);
		const withSilence = measureLoudnessFromAudioBuffer(
			createAudioBuffer([concatenate(tone, new Float32Array(tone.length))]),
		);

		expect(
			Math.abs(
				(withSilence?.integratedLufs ?? 0) -
					(withoutSilence?.integratedLufs ?? 0),
			),
		).toBeLessThan(0.2);
	});

	it("reports no loudness range for a steady tone and a wide range for a varying one", () => {
		const steady = measureLoudnessFromAudioBuffer(
			createAudioBuffer([createTone({ seconds: 30 })]),
		);
		const varying = measureLoudnessFromAudioBuffer(
			createAudioBuffer([
				concatenate(
					createTone({ amplitude: 1, seconds: 15 }),
					createTone({ amplitude: 0.1, seconds: 15 }),
				),
			]),
		);

		expect(steady?.loudnessRangeLu).toBeCloseTo(0, 1);
		expect(varying?.loudnessRangeLu ?? 0).toBeCloseTo(20, 0);
	});

	it("finds inter-sample peaks above the sample peak", () => {
		const tone = createTone({
			amplitude: 0.5,
			frequency: SAMPLE_RATE / 4,
			phase: Math.PI / 4,
		});
		const metrics = measureLoudnessFromAudioBuffer(createAudioBuffer([tone]));

		expect(metrics?.samplePeakDb ?? 0).toBeCloseTo(-9.03, 1);
		expect(metrics?.truePeakDb ?? -100).toBeGreaterThan(
			metrics?.samplePeakDb ?? 0,
		);
		expect(metrics?.truePeakDb ?? 0).toBeCloseTo(-6.02, 0);
	});

	it("returns null for silence and for audio shorter than one gating block", () => {
		expect(
			measureLoudnessFromAudioBuffer(
				createAudioBuffer([new Float32Array(SAMPLE_RATE)]),
			),
		).toBeNull();
		expect(
			measureLoudnessFromAudioBuffer(
				createAudioBuffer([createTone({ seconds: 0.2 })]),
			),
		).toBeNull();
	});
});

describe("normalizeLoudnessMetrics", () => {
	it("drops records without usable measurements", () => {
		expect(normalizeLoudnessMetrics(undefined)).toBeUndefined();
		expect(
			normalizeLoudnessMetrics({ integratedLufs: -9, truePeakDb: Number.NaN }),
		).toBeUndefined();
	});

	it("backfills optional fields from the primary measurements", () => {
		expect(
			normalizeLoudnessMetrics({ integratedLufs: -9.4, truePeakDb: -0.3 }),
		).toEqual({
			integratedLufs: -9.4,
			loudnessRangeLu: 0,
			shortTermMaxLufs: -9.4,
			samplePeakDb: -0.3,
			truePeakDb: -0.3,
		});
	});
});

describe("describeStreamingNormalization", () => {
	it("describes the gain each streaming target applies", () => {
		expect(describeStreamingNormalization(-9.4)).toBe(
			[
				"Spotify, YouTube, Tidal, Amazon (-14 LUFS): -4.6 dB",
				"Deezer (-15 LUFS): -5.6 dB",
				"Apple Music (-16 LUFS): -6.6 dB",
			].join("\n"),
		);
	});

	it("shows a positive gain for tracks quieter than the target", () => {
		expect(describeStreamingNormalization(-20)).toContain(
			"Spotify, YouTube, Tidal, Amazon (-14 LUFS): +6.0 dB",
		);
	});
});
