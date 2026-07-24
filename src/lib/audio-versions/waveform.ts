import type { WaveformData } from "./types";

const DEFAULT_PEAK_COUNT = 960;
const FALLBACK_PEAK_COUNT = 120;
export const MIN_VOLUME_DB = -12;
export const MAX_VOLUME_DB = 12;

const AIFF_FORM = "FORM";
const AIFF_TYPE = "AIFF";
const AIFFC_TYPE = "AIFC";
const AIFF_COMMON_CHUNK = "COMM";
const AIFF_SOUND_CHUNK = "SSND";

export function normalizeWaveformData(
	waveform: Partial<WaveformData> | null | undefined,
	fallbackDurationMs = 0,
): WaveformData {
	const normalizedPeaks = Array.isArray(waveform?.peaks)
		? waveform.peaks
				.filter((value): value is number => Number.isFinite(value))
				.map((value) => Math.max(0, Math.min(1, value)))
		: [];
	const peakCount = Math.max(
		1,
		Math.min(
			DEFAULT_PEAK_COUNT,
			Math.round(
				typeof waveform?.peakCount === "number" && waveform.peakCount > 0
					? waveform.peakCount
					: normalizedPeaks.length || FALLBACK_PEAK_COUNT,
			),
		),
	);

	return {
		peaks:
			normalizedPeaks.length > 0 ? normalizedPeaks : Array(peakCount).fill(0),
		peakCount: normalizedPeaks.length > 0 ? normalizedPeaks.length : peakCount,
		durationMs: Math.max(
			0,
			Math.round(
				typeof waveform?.durationMs === "number" && waveform.durationMs > 0
					? waveform.durationMs
					: fallbackDurationMs,
			),
		),
		sampleRate: Math.max(
			1,
			Math.round(
				typeof waveform?.sampleRate === "number" && waveform.sampleRate > 0
					? waveform.sampleRate
					: 44100,
			),
		),
	};
}

export function hasRenderableWaveform(
	waveform: Partial<WaveformData> | null | undefined,
): boolean {
	return Array.isArray(waveform?.peaks)
		? waveform.peaks.some((value) => Number.isFinite(value))
		: false;
}

export function normalizeVolumeDb(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(MIN_VOLUME_DB, Math.min(MAX_VOLUME_DB, Math.round(value)));
}

export function volumeDbToGain(volumeDb: number): number {
	return 10 ** (normalizeVolumeDb(volumeDb) / 20);
}

export function isAudioDecodingSupported(): boolean {
	return Boolean(getAudioContextCtor());
}

/** Decodes `file` and hands the buffer to `read` before the context is closed. */
export async function withDecodedAudio<Result>(
	file: Blob,
	read: (audioBuffer: AudioBuffer) => Result,
): Promise<Result> {
	if (typeof window === "undefined") {
		throw new Error("Audio decoding is only available in the browser.");
	}

	const AudioContextCtor = getAudioContextCtor();
	if (!AudioContextCtor) {
		throw new Error("This browser does not support Web Audio decoding.");
	}

	const context = new AudioContextCtor();
	try {
		const browserAudioBlob = await normalizeAudioBlobForBrowser(file);
		return read(
			await context.decodeAudioData(await browserAudioBlob.arrayBuffer()),
		);
	} catch {
		throw new Error(
			"Audio Versions could not decode that audio file. Try a shorter file or a browser-friendly format such as WAV, AIFF, MP3, or AAC.",
		);
	} finally {
		await context.close().catch(() => undefined);
	}
}

export function extractWaveformFromAudioBuffer(
	audioBuffer: AudioBuffer,
	peakCount = DEFAULT_PEAK_COUNT,
): WaveformData {
	const peaks = extractPeaks(audioBuffer, peakCount);
	const durationMs = Math.round(audioBuffer.duration * 1000);

	return normalizeWaveformData(
		{
			peaks,
			peakCount: peaks.length,
			durationMs,
			sampleRate: audioBuffer.sampleRate,
		},
		durationMs,
	);
}

export async function generateWaveformFromFile(
	file: Blob,
	peakCount = DEFAULT_PEAK_COUNT,
): Promise<WaveformData> {
	return withDecodedAudio(file, (audioBuffer) =>
		extractWaveformFromAudioBuffer(audioBuffer, peakCount),
	);
}

export async function normalizeAudioBlobForBrowser(file: Blob): Promise<Blob> {
	const buffer = await file.arrayBuffer();
	if (!isAiffBuffer(buffer)) {
		return file;
	}

	return encodeWav(parseAiff(buffer));
}

export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function clampTime(timeMs: number, durationMs: number): number {
	return Math.max(0, Math.min(durationMs, timeMs));
}

function getAudioContextCtor(): typeof AudioContext | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}

	return (
		window.AudioContext ||
		(window as Window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext
	);
}

function extractPeaks(audioBuffer: AudioBuffer, targetPeaks: number): number[] {
	const length = audioBuffer.length;
	const channelCount = audioBuffer.numberOfChannels;
	const bucketSize = Math.max(1, Math.floor(length / targetPeaks));
	const peaks: number[] = [];

	for (let bucket = 0; bucket < targetPeaks; bucket += 1) {
		const start = bucket * bucketSize;
		if (start >= length) {
			break;
		}

		const end = Math.min(length, start + bucketSize);
		let peak = 0;

		for (let channel = 0; channel < channelCount; channel += 1) {
			const data = audioBuffer.getChannelData(channel);
			for (let index = start; index < end; index += 1) {
				const value = Math.abs(data[index] ?? 0);
				if (value > peak) {
					peak = value;
				}
			}
		}

		peaks.push(peak);
	}

	const maxPeak = Math.max(...peaks, 1);
	return peaks.map((value) => value / maxPeak);
}

interface AiffAudio {
	channels: number;
	sampleRate: number;
	samples: Float32Array[];
}

function isAiffBuffer(buffer: ArrayBuffer): boolean {
	if (buffer.byteLength < 12) {
		return false;
	}

	const view = new DataView(buffer);
	return (
		readFourCc(view, 0) === AIFF_FORM &&
		(readFourCc(view, 8) === AIFF_TYPE || readFourCc(view, 8) === AIFFC_TYPE)
	);
}

function parseAiff(buffer: ArrayBuffer): AiffAudio {
	const view = new DataView(buffer);
	const formType = readFourCc(view, 8);
	let common: {
		channels: number;
		frameCount: number;
		sampleSize: number;
		sampleRate: number;
		compression?: string;
	} | null = null;
	let soundData: { offset: number; length: number } | null = null;

	for (let offset = 12; offset + 8 <= view.byteLength; ) {
		const chunkType = readFourCc(view, offset);
		const chunkSize = view.getUint32(offset + 4, false);
		const chunkStart = offset + 8;
		const chunkEnd = chunkStart + chunkSize;
		if (chunkEnd > view.byteLength) {
			throw new Error("Invalid AIFF chunk.");
		}

		if (chunkType === AIFF_COMMON_CHUNK) {
			if (chunkSize < 18) {
				throw new Error("Invalid AIFF common chunk.");
			}

			common = {
				channels: view.getUint16(chunkStart, false),
				frameCount: view.getUint32(chunkStart + 2, false),
				sampleSize: view.getUint16(chunkStart + 6, false),
				sampleRate: readExtendedFloat(view, chunkStart + 8),
				compression:
					formType === AIFFC_TYPE
						? readFourCc(view, chunkStart + 18)
						: undefined,
			};
		} else if (chunkType === AIFF_SOUND_CHUNK) {
			if (chunkSize < 8) {
				throw new Error("Invalid AIFF sound chunk.");
			}

			const dataOffset = view.getUint32(chunkStart, false);
			const audioStart = chunkStart + 8 + dataOffset;
			if (audioStart > chunkEnd) {
				throw new Error("Invalid AIFF sound data offset.");
			}

			soundData = {
				offset: audioStart,
				length: chunkEnd - audioStart,
			};
		}

		offset = chunkEnd + (chunkSize % 2);
	}

	if (!common || !soundData) {
		throw new Error("AIFF is missing audio data.");
	}
	if (
		common.channels < 1 ||
		common.channels > 32 ||
		common.sampleSize < 8 ||
		common.sampleSize > 32 ||
		!Number.isFinite(common.sampleRate) ||
		common.sampleRate <= 0
	) {
		throw new Error("Unsupported AIFF audio format.");
	}
	if (
		formType === AIFFC_TYPE &&
		common.compression !== "NONE" &&
		common.compression !== "twos" &&
		common.compression !== "sowt"
	) {
		throw new Error("Compressed AIFF is not supported.");
	}

	const bytesPerSample = Math.ceil(common.sampleSize / 8);
	const frameSize = common.channels * bytesPerSample;
	const frameCount = Math.min(
		common.frameCount,
		Math.floor(soundData.length / frameSize),
	);
	const samples = Array.from(
		{ length: common.channels },
		() => new Float32Array(frameCount),
	);
	const littleEndian = common.compression === "sowt";

	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let channel = 0; channel < common.channels; channel += 1) {
			const sampleOffset =
				soundData.offset + frame * frameSize + channel * bytesPerSample;
			samples[channel][frame] = readPcmSample(
				view,
				sampleOffset,
				bytesPerSample,
				common.sampleSize,
				littleEndian,
			);
		}
	}

	return {
		channels: common.channels,
		sampleRate: common.sampleRate,
		samples,
	};
}

function encodeWav(audio: AiffAudio): Blob {
	const frameCount = audio.samples[0]?.length ?? 0;
	const bytesPerSample = 4;
	const dataSize = frameCount * audio.channels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeFourCc(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeFourCc(view, 8, "WAVE");
	writeFourCc(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, audio.channels, true);
	view.setUint32(24, Math.round(audio.sampleRate), true);
	view.setUint32(
		28,
		Math.round(audio.sampleRate) * audio.channels * bytesPerSample,
		true,
	);
	view.setUint16(32, audio.channels * bytesPerSample, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeFourCc(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let channel = 0; channel < audio.channels; channel += 1) {
			const sample = Math.max(
				-1,
				Math.min(1, audio.samples[channel]?.[frame] ?? 0),
			);
			view.setInt32(
				offset,
				sample <= -1 ? -0x80000000 : Math.round(sample * 0x7fffffff),
				true,
			);
			offset += bytesPerSample;
		}
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function readPcmSample(
	view: DataView,
	offset: number,
	bytesPerSample: number,
	sampleSize: number,
	littleEndian: boolean,
): number {
	let value = 0;
	if (littleEndian) {
		for (let byte = bytesPerSample - 1; byte >= 0; byte -= 1) {
			value = value * 256 + view.getUint8(offset + byte);
		}
	} else {
		for (let byte = 0; byte < bytesPerSample; byte += 1) {
			value = value * 256 + view.getUint8(offset + byte);
		}
	}

	const signBit = 2 ** (sampleSize - 1);
	const fullScale = 2 ** sampleSize;
	if (value >= signBit) {
		value -= fullScale;
	}

	return value / signBit;
}

function readExtendedFloat(view: DataView, offset: number): number {
	const exponent = view.getUint16(offset, false);
	const highMantissa = view.getUint32(offset + 2, false);
	const lowMantissa = view.getUint32(offset + 6, false);
	if (exponent === 0 && highMantissa === 0 && lowMantissa === 0) {
		return 0;
	}

	const sign = exponent & 0x8000 ? -1 : 1;
	const unbiasedExponent = (exponent & 0x7fff) - 16383;
	const mantissa = highMantissa * 2 ** 32 + lowMantissa;
	return sign * mantissa * 2 ** (unbiasedExponent - 63);
}

function readFourCc(view: DataView, offset: number): string {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);
}

function writeFourCc(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}
