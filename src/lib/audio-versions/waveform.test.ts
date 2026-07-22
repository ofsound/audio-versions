import { describe, expect, it } from "vitest";
import { normalizeAudioBlobForBrowser } from "./waveform";

describe("normalizeAudioBlobForBrowser", () => {
	it("converts uncompressed AIFF PCM to browser-friendly WAV", async () => {
		const aiff = createAiff16BitMonoFile();
		const normalized = await normalizeAudioBlobForBrowser(aiff);
		const buffer = await normalized.arrayBuffer();
		const view = new DataView(buffer);

		expect(normalized.type).toBe("audio/wav");
		expect(readFourCc(view, 0)).toBe("RIFF");
		expect(readFourCc(view, 8)).toBe("WAVE");
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(44100);
		expect(view.getUint32(40, true)).toBe(12);
		expect(view.getInt32(44, true)).toBe(-2147483648);
		expect(view.getInt32(48, true)).toBe(0);
		expect(view.getInt32(52, true)).toBe(2147418111);
	});
});

function createAiff16BitMonoFile(): Blob {
	const buffer = new ArrayBuffer(60);
	const view = new DataView(buffer);

	writeFourCc(view, 0, "FORM");
	view.setUint32(4, 52, false);
	writeFourCc(view, 8, "AIFF");
	writeFourCc(view, 12, "COMM");
	view.setUint32(16, 18, false);
	view.setUint16(20, 1, false);
	view.setUint32(22, 3, false);
	view.setUint16(26, 16, false);
	new Uint8Array(buffer, 28, 10).set([
		0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0,
	]);
	writeFourCc(view, 38, "SSND");
	view.setUint32(42, 14, false);
	view.setUint32(46, 0, false);
	view.setUint32(50, 0, false);
	view.setInt16(54, -32768, false);
	view.setInt16(56, 0, false);
	view.setInt16(58, 32767, false);

	return new Blob([buffer], { type: "audio/aiff" });
}

function writeFourCc(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

function readFourCc(view: DataView, offset: number): string {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);
}
