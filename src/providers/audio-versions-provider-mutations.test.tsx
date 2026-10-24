// @vitest-environment jsdom

import { File as MemoryFile } from "node:buffer";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { saveAudioBlob } from "#/lib/audio-versions/db";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import { uploadRemoteAudio } from "#/lib/cloud/media";
import { EMPTY_SNAPSHOT } from "./audio-versions-provider-hydration";
import { useAudioFileMutations } from "./audio-versions-provider-mutations";
import type { CommitSnapshot } from "./audio-versions-provider-state";

vi.mock("#/lib/audio-versions/db", () => ({
	saveAudioBlob: vi.fn(),
	saveAudioFile: vi.fn(),
}));

vi.mock("#/lib/cloud/media", () => ({
	uploadRemoteAudio: vi.fn(),
}));

vi.mock("#/lib/audio-versions/waveform", () => ({
	normalizeAudioBlobForBrowser: async (blob: Blob) => blob,
	withDecodedAudio: vi.fn().mockResolvedValue({
		waveform: {
			peaks: [0.2],
			peakCount: 1,
			durationMs: 1000,
			sampleRate: 44100,
		},
	}),
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("copies imported bytes before upload and queued persistence can invalidate the disk file", async () => {
	vi.stubGlobal("File", MemoryFile);
	const source = new File(["original audio"], "take.aiff", {
		type: "audio/aiff",
		lastModified: 123,
	});
	const readSource = vi.spyOn(source, "arrayBuffer");
	vi.mocked(uploadRemoteAudio).mockImplementation(
		async (_userId, _audioFileId, uploaded) => {
			readSource.mockRejectedValue(new Error("Source file changed"));
			expect(uploaded).not.toBe(source);
			expect(await uploaded.text()).toBe("original audio");
			return {
				pathname: "take.aiff",
				contentType: uploaded.type,
				size: uploaded.size,
				originalName: uploaded.name,
			};
		},
	);
	const commitSnapshot: CommitSnapshot = async (update, persist) => {
		const next = update(EMPTY_SNAPSHOT);
		await persist(next);
		return next;
	};
	const { result } = renderHook(() =>
		useAudioFileMutations({
			cloud: null,
			cloudUserId: "user-1",
			commitSnapshot,
			prunePlaybackState: vi.fn(),
			removeRegisteredAudio: vi.fn(),
			setError: vi.fn(),
		}),
	);
	await act(async () => {
		await result.current.addAudioFile("song-1", {
			file: source,
			title: "Take",
			sessionDate: "2026-10-05",
			notes: EMPTY_RICH_TEXT,
		});
	});
	const saved = vi.mocked(saveAudioBlob).mock.calls[0]?.[1];
	expect(saved).not.toBe(source);
	expect(await saved?.text()).toBe("original audio");
	expect(saved?.type).toBe("audio/aiff");
	expect(saved).toMatchObject({ name: "take.aiff", lastModified: 123 });
	expect(readSource).toHaveBeenCalledTimes(1);
});
