// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAudioSource } from "./use-audio-source";

vi.mock("#/lib/cloud/media", () => ({
	getRemoteAudioUrl: async () => "https://media.example/mix.mp3",
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("keeps a playing source until pause, then switches to cached audio at the same position", async () => {
	const element = document.createElement("audio");
	const ref = { current: element };
	let paused = true;
	Object.defineProperty(element, "paused", { get: () => paused });
	const createObjectURL = vi.fn(() => "blob:cached");
	vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
	const remoteMedia = {
		pathname: "mix.mp3",
		size: 3,
		originalName: "mix.mp3",
		contentType: "audio/mpeg",
	};
	const { result, rerender } = renderHook(
		({ blob }: { blob?: Blob }) =>
			useAudioSource("file", blob, remoteMedia, ref),
		{ initialProps: {} },
	);
	await waitFor(() =>
		expect(result.current).toBe("https://media.example/mix.mp3"),
	);
	element.currentTime = 42;
	paused = false;
	const blob = new Blob(["mp3"]);
	rerender({ blob });
	await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
	expect(result.current).toBe("https://media.example/mix.mp3");
	paused = true;
	rerender({ blob });
	expect(result.current).toBe("blob:cached");
	expect(element.currentTime).toBe(42);
});
