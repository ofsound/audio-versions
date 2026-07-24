import { describe, expect, it } from "vitest";
import {
	dataTransferLooksLikeFileDrag,
	getAudioFileFromDataTransfer,
	isAudioFile,
	titleFromAudioFileName,
} from "./audio-file-drop";

describe("audio-file-drop helpers", () => {
	it("recognizes audio mime types and common extensions", () => {
		expect(isAudioFile(new File([], "mix.wav", { type: "audio/wav" }))).toBe(
			true,
		);
		expect(isAudioFile(new File([], "print.aiff", { type: "" }))).toBe(true);
		expect(isAudioFile(new File([], "notes.txt", { type: "text/plain" }))).toBe(
			false,
		);
	});

	it("detects file drags from dataTransfer types", () => {
		expect(
			dataTransferLooksLikeFileDrag({
				types: ["Files"],
			} as unknown as DataTransfer),
		).toBe(true);
		expect(
			dataTransferLooksLikeFileDrag({
				types: ["text/plain"],
			} as unknown as DataTransfer),
		).toBe(false);
	});

	it("picks the first audio file from a drop payload", () => {
		const audio = new File(["tone"], "mix-v2.wav", { type: "audio/wav" });
		const text = new File(["notes"], "notes.txt", { type: "text/plain" });

		expect(
			getAudioFileFromDataTransfer({
				files: [text, audio],
			} as unknown as DataTransfer),
		).toBe(audio);
		expect(
			getAudioFileFromDataTransfer({
				files: [text],
			} as unknown as DataTransfer),
		).toBeNull();
	});

	it("derives a display title from the file name", () => {
		expect(titleFromAudioFileName("High Plains Drifter v16.wav")).toBe(
			"High Plains Drifter v16",
		);
	});
});
