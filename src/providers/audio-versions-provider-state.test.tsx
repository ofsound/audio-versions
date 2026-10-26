// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type AudioVersionsSnapshot,
	createEmptySettings,
} from "#/lib/audio-versions/types";
import { useAudioVersionsSnapshotState } from "./audio-versions-provider-state";

const mocks = vi.hoisted(() => ({
	load: vi.fn(),
	replace: vi.fn(),
	cloud: vi.fn(),
	subscribe: vi.fn(),
}));
vi.mock("#/lib/audio-versions/db", () => ({
	loadSnapshot: mocks.load,
	replaceLocalSnapshot: mocks.replace,
	getLocalOwnerId: async () => "user-1",
	saveAudioFile: vi.fn(),
}));
vi.mock("#/lib/cloud/persistence", () => ({
	loadCloudSnapshot: mocks.cloud,
	subscribeToCloudChanges: mocks.subscribe,
	uploadCloudSnapshot: vi.fn(),
}));
function snapshot(): AudioVersionsSnapshot {
	return {
		songs: [],
		audioFiles: [],
		annotations: [],
		playlists: [],
		blobsByAudioId: {},
		settings: createEmptySettings(),
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.load.mockResolvedValue(snapshot());
	mocks.replace.mockResolvedValue(undefined);
	mocks.cloud.mockResolvedValue({ exists: true, snapshot: snapshot() });
	mocks.subscribe.mockReturnValue(() => {});
});
afterEach(cleanup);

it("keeps newer settings when an older cloud response arrives during an edit", async () => {
	const staleRead = deferred<{ snapshot: AudioVersionsSnapshot }>();
	const saved = deferred<void>();
	const { result } = renderHook(() => useAudioVersionsSnapshotState("user-1"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	mocks.cloud.mockReturnValueOnce(staleRead.promise);
	act(() => {
		mocks.subscribe.mock.calls[0][1]();
	});
	await waitFor(() => expect(mocks.cloud).toHaveBeenCalledTimes(2));
	let mutation!: Promise<AudioVersionsSnapshot>;
	act(() => {
		mutation = result.current.commitSnapshot(
			(current) => ({
				...current,
				settings: {
					...current.settings,
					ui: {
						...current.settings.ui,
						showArtist: false,
					},
				},
			}),
			() => saved.promise,
		);
	});
	expect(result.current.snapshot.settings.ui.showArtist).toBe(false);
	await act(async () => {
		staleRead.resolve({ snapshot: snapshot() });
	});
	expect(result.current.snapshot.settings.ui.showArtist).toBe(false);
	// No stale full-cache replacement is allowed, either.
	expect(mocks.replace).toHaveBeenCalledTimes(1);
	const persisted = {
		...snapshot(),
		settings: result.current.snapshot.settings,
	};
	mocks.cloud.mockResolvedValue({ exists: true, snapshot: persisted });
	await act(async () => {
		saved.resolve();
		await mutation;
	});
	await waitFor(() => expect(mocks.cloud).toHaveBeenCalledTimes(3));
	expect(result.current.snapshot.settings.ui.showArtist).toBe(false);
});

it("waits for queued writes before reading a realtime settings echo", async () => {
	const saved = deferred<void>();
	const { result } = renderHook(() => useAudioVersionsSnapshotState("user-1"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	let mutation!: Promise<AudioVersionsSnapshot>;
	act(() => {
		mutation = result.current.commitSnapshot(
			(current) => ({
				...current,
				settings: {
					...current.settings,
					ui: { ...current.settings.ui, showProject: false },
				},
			}),
			() => saved.promise,
		);
		mocks.subscribe.mock.calls[0][1]();
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 120));
	});
	expect(mocks.cloud).toHaveBeenCalledTimes(1);
	mocks.cloud.mockResolvedValue({
		exists: true,
		snapshot: result.current.snapshot,
	});
	await act(async () => {
		saved.resolve();
		await mutation;
	});
	await waitFor(() => expect(mocks.cloud).toHaveBeenCalledTimes(2));
	expect(result.current.snapshot.settings.ui.showProject).toBe(false);
});

it("keeps a newer font size when a realtime refresh reads older settings", async () => {
	const { result } = renderHook(() => useAudioVersionsSnapshotState("user-1"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	await act(async () => {
		await result.current.commitSnapshot(
			(current) => ({
				...current,
				settings: {
					...current.settings,
					ui: { ...current.settings.ui, songNotesFontSize: 18 },
				},
			}),
			async () => {},
		);
	});
	expect(result.current.snapshot.settings.ui.songNotesFontSize).toBe(18);
	const older = snapshot();
	older.settings = {
		...older.settings,
		ui: { ...older.settings.ui, songNotesFontSize: 14 },
	};
	mocks.cloud.mockResolvedValue({ exists: true, snapshot: older });
	act(() => {
		mocks.subscribe.mock.calls[0][1]();
	});
	await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(2));
	expect(result.current.snapshot.settings.ui.songNotesFontSize).toBe(18);
	expect(mocks.replace.mock.calls[1][0].settings.ui.songNotesFontSize).toBe(18);
});

it("accepts a newer cloud settings document", async () => {
	const { result } = renderHook(() => useAudioVersionsSnapshotState("user-1"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	await act(async () => {
		await result.current.commitSnapshot(
			(current) => ({
				...current,
				settings: {
					...current.settings,
					ui: { ...current.settings.ui, songNotesFontSize: 16 },
				},
			}),
			async () => {},
		);
	});
	const newer = snapshot();
	newer.settings = {
		...result.current.snapshot.settings,
		revision: (result.current.snapshot.settings.revision ?? 0) + 1,
		ui: { ...result.current.snapshot.settings.ui, songNotesFontSize: 20 },
	};
	mocks.cloud.mockResolvedValue({ exists: true, snapshot: newer });
	act(() => {
		mocks.subscribe.mock.calls[0][1]();
	});
	await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(2));
	expect(result.current.snapshot.settings.ui.songNotesFontSize).toBe(20);
});

it("restores the signed-in owner's local library when cloud loading is offline", async () => {
	const local = snapshot();
	local.songs = [
		{
			id: "offline-song",
			title: "Saved song",
			artist: "",
			project: "",
			generalNotes: "",
			audioFileOrder: [],
			createdAt: "",
			updatedAt: "",
		},
	];
	mocks.load.mockResolvedValue(local);
	mocks.cloud.mockRejectedValue(new TypeError("Failed to fetch"));
	const { result } = renderHook(() => useAudioVersionsSnapshotState("user-1"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(result.current.snapshot.songs[0].title).toBe("Saved song");
	expect(result.current.error).toBeNull();
});
