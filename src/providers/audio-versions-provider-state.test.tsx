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
