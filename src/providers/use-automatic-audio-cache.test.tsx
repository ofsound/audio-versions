// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type AudioVersionsSnapshot,
	createEmptySettings,
} from "#/lib/audio-versions/types";
import type { CommitSnapshot } from "./audio-versions-provider-state";
import { useAutomaticAudioCache } from "./use-automatic-audio-cache";

const { save, signedUrl } = vi.hoisted(() => ({
	save: vi.fn(),
	signedUrl: vi.fn(),
}));
vi.mock("#/lib/audio-versions/db", () => ({ saveAudioBlob: save }));
vi.mock("#/lib/cloud/media", () => ({ getRemoteAudioUrl: signedUrl }));
const fetchMock = vi.fn();
function fixture(): AudioVersionsSnapshot {
	return {
		songs: [
			{
				id: "song",
				title: "Song",
				artist: "",
				project: "",
				generalNotes: "",
				audioFileOrder: [],
				createdAt: "",
				updatedAt: "",
			},
		],
		audioFiles: Array.from({ length: 4 }, (_, index) => ({
			id: `file-${index}`,
			songId: "song",
			title: "Mix",
			sessionDate: "",
			notes: { type: "doc" },
			durationMs: 1000,
			volumeDb: 0,
			waveform: {
				peaks: [],
				peakCount: 0,
				durationMs: 1000,
				sampleRate: 44100,
			},
			createdAt: "",
			updatedAt: "",
			remoteMedia: {
				pathname: `mix-${index}.mp3`,
				size: 3,
				contentType: "audio/mpeg",
				originalName: "mix.mp3",
			},
		})),
		annotations: [],
		playlists: [],
		blobsByAudioId: {},
		settings: createEmptySettings(),
	};
}
function setup(snapshot = fixture()) {
	const snapshotRef = { current: snapshot };
	const commitSnapshot: CommitSnapshot = async (update, persist) => {
		snapshotRef.current = update(snapshotRef.current);
		await persist(snapshotRef.current);
		return snapshotRef.current;
	};
	const hook = renderHook(() =>
		useAutomaticAudioCache({
			cloudUserId: "owner",
			ready: true,
			audioFiles: snapshotRef.current.audioFiles,
			snapshotRef,
			commitSnapshot,
		}),
	);
	return { ...hook, snapshotRef };
}
beforeEach(() => {
	save.mockReset().mockResolvedValue(undefined);
	signedUrl
		.mockReset()
		.mockImplementation(async (id) => `https://media.example/${id}`);
	fetchMock.mockReset().mockImplementation(async () => ({
		ok: true,
		blob: async () => new Blob(["mp3"]),
	}));
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("downloads all active cloud files without pressing play and skips existing local audio", async () => {
	const snapshot = fixture();
	snapshot.blobsByAudioId["file-0"] = new Blob(["mp3"]);
	const { snapshotRef } = setup(snapshot);
	await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
	expect(Object.keys(snapshotRef.current.blobsByAudioId)).toHaveLength(4);
	expect(signedUrl).not.toHaveBeenCalledWith("file-0");
	expect(save).toHaveBeenCalledWith("file-1", expect.any(Blob), {
		ownerId: "owner",
		pathname: "mix-1.mp3",
	});
});
it("bounds downloads to two concurrent requests", async () => {
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	fetchMock.mockImplementation(async () => {
		await pending;
		return { ok: true, blob: async () => new Blob(["mp3"]) };
	});
	setup();
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	await act(async () => {
		finish();
	});
	await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
});
it("retries failed files when connectivity returns and rejects partial downloads", async () => {
	fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
	setup();
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
	expect(save).not.toHaveBeenCalled();
	fetchMock.mockResolvedValue({
		ok: true,
		blob: async () => new Blob(["mp3"]),
	});
	act(() => window.dispatchEvent(new Event("online")));
	await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
});
it("does not retain downloads that complete after sign-out or unmount", async () => {
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	fetchMock.mockImplementation(async () => {
		await pending;
		return { ok: true, blob: async () => new Blob(["mp3"]) };
	});
	const { unmount, snapshotRef } = setup();
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	unmount();
	await act(async () => {
		finish();
	});
	expect(save).not.toHaveBeenCalled();
	expect(snapshotRef.current.blobsByAudioId).toEqual({});
});
it("does not download trashed songs", async () => {
	const snapshot = fixture();
	snapshot.songs[0].deletedAt = "2026-10-26";
	setup(snapshot);
	await act(async () => {});
	expect(fetchMock).not.toHaveBeenCalled();
});
