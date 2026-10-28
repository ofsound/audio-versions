// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { LibraryPreviewAudio } from "./library-preview-audio";

const provider = {
	registerAudioElement: vi.fn(),
	reportPlaybackState: vi.fn(),
	seekFile: vi.fn(),
};
const remote = vi.hoisted(() => vi.fn());
vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => provider,
}));
vi.mock("#/lib/cloud/media", () => ({ getRemoteAudioUrl: remote }));
vi.mock("./use-waveform-audio-graph", () => ({
	useWaveformAudioGraph: vi.fn(),
}));
const audioFile = { id: "file", volumeDb: 0 } as AudioFileRecord;

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
	Object.defineProperty(HTMLMediaElement.prototype, "paused", {
		configurable: true,
		get: () => false,
	});
	provider.seekFile.mockResolvedValue(undefined);
	remote.mockResolvedValue("https://example.com/audio");
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: vi.fn(() => "blob:local"),
			revokeObjectURL: vi.fn(),
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("plays cached audio from zero and pauses, rewinds and unregisters on Stop", async () => {
	const { container, unmount } = render(
		<LibraryPreviewAudio
			audioFile={audioFile}
			blob={new Blob(["audio"])}
			onStop={vi.fn()}
			onError={vi.fn()}
		/>,
	);
	await waitFor(() =>
		expect(provider.seekFile).toHaveBeenCalledWith("file", 0, true),
	);
	expect(remote).not.toHaveBeenCalled();
	const element = container.querySelector("audio");
	if (!element) throw new Error("Missing preview audio");
	element.currentTime = 4;
	unmount();
	expect(element.pause).toHaveBeenCalled();
	expect(element.currentTime).toBe(0);
	expect(provider.registerAudioElement).toHaveBeenLastCalledWith("file", null);
	expect(provider.reportPlaybackState).toHaveBeenLastCalledWith("file", {
		isPlaying: false,
		currentTimeMs: 0,
	});
});

it("cancels a pending cloud preview when stopped before the link arrives", async () => {
	let resolve!: (url: string) => void;
	remote.mockImplementation(
		() =>
			new Promise<string>((done) => {
				resolve = done;
			}),
	);
	const { unmount } = render(
		<LibraryPreviewAudio
			audioFile={audioFile}
			onStop={vi.fn()}
			onError={vi.fn()}
		/>,
	);
	unmount();
	resolve("https://example.com/audio");
	await Promise.resolve();
	expect(provider.seekFile).not.toHaveBeenCalled();
});

it("reports cloud media failures", async () => {
	remote.mockRejectedValue(new Error("Unavailable"));
	const onError = vi.fn();
	render(
		<LibraryPreviewAudio
			audioFile={audioFile}
			onStop={vi.fn()}
			onError={onError}
		/>,
	);
	await waitFor(() => expect(onError).toHaveBeenCalledWith("Unavailable"));
});
