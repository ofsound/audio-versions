// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AudioVersionsSnapshot,
	createEmptySettings,
	type GalleryImage,
} from "#/lib/audio-versions/types";
import { useGalleryMutations } from "./audio-versions-provider-gallery-mutations";
import type { CommitSnapshot } from "./audio-versions-provider-state";

const mocks = vi.hoisted(() => ({
	prepare: vi.fn(),
	saveBlob: vi.fn(),
	deleteBlob: vi.fn(),
	saveSong: vi.fn(),
	saveFile: vi.fn(),
	upload: vi.fn(),
	deleteRemote: vi.fn(),
}));
vi.mock("#/lib/audio-versions/db", () => ({
	saveGalleryBlob: mocks.saveBlob,
	deleteGalleryBlob: mocks.deleteBlob,
	saveSong: mocks.saveSong,
	saveAudioFile: mocks.saveFile,
}));
vi.mock("#/lib/audio-versions/gallery-images", () => ({
	prepareGalleryImage: mocks.prepare,
}));
vi.mock("#/lib/cloud/media", () => ({
	uploadRemoteGalleryImage: mocks.upload,
	deleteRemoteGalleryPath: mocks.deleteRemote,
}));
const image: GalleryImage = {
	id: "image",
	name: "master.png",
	width: 1600,
	height: 1000,
	size: 10,
	contentType: "image/png",
	createdAt: "today",
};
function initial(): AudioVersionsSnapshot {
	return {
		songs: [
			{
				id: "song",
				title: "Song",
				artist: "",
				project: "",
				generalNotes: "",
				audioFileOrder: [],
				createdAt: "today",
				updatedAt: "today",
			},
		],
		audioFiles: [],
		annotations: [],
		playlists: [],
		blobsByAudioId: {},
		settings: createEmptySettings(),
	};
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.deleteBlob.mockResolvedValue(undefined);
	mocks.deleteRemote.mockResolvedValue(undefined);
	mocks.prepare.mockResolvedValue({
		image,
		original: new Blob(["original"]),
		thumbnail: new Blob(["thumb"]),
	});
});
afterEach(cleanup);
describe("gallery mutations", () => {
	it("appends to the latest parent without losing concurrent song edits", async () => {
		let snapshot = initial();
		const commitSnapshot: CommitSnapshot = async (update, persist) => {
			snapshot = update({
				...snapshot,
				songs: snapshot.songs.map((song) => ({
					...song,
					title: "Renamed",
					generalNotes: "New notes",
				})),
			});
			await persist(snapshot);
			return snapshot;
		};
		const { result } = renderHook(() =>
			useGalleryMutations({ cloud: null, commitSnapshot }),
		);
		await act(() =>
			result.current.addGalleryImages({ songId: "song" }, [
				new File(["x"], "master.png"),
			]),
		);
		expect(snapshot.songs[0]).toMatchObject({
			title: "Renamed",
			generalNotes: "New notes",
			galleryImages: [image],
		});
		expect(mocks.saveSong).toHaveBeenCalledWith(snapshot.songs[0]);
		expect(mocks.saveBlob).toHaveBeenCalled();
		await act(() =>
			result.current.removeGalleryImage({ songId: "song" }, "image"),
		);
		expect(snapshot.songs[0]?.galleryImages).toEqual([]);
		expect(mocks.deleteBlob).toHaveBeenCalledWith("image");
	});
	it("rejects stale destinations and cleans unattached blobs", async () => {
		const snapshot = initial();
		const commitSnapshot: CommitSnapshot = async (update, persist) => {
			const next = update(snapshot);
			await persist(next);
			return next;
		};
		const { result } = renderHook(() =>
			useGalleryMutations({ cloud: null, commitSnapshot }),
		);
		await expect(
			result.current.addGalleryImages(
				{ songId: "song", audioFileId: "other-song-file" },
				[new File(["x"], "master.png")],
			),
		).rejects.toThrow("no longer available");
		expect(mocks.deleteBlob).toHaveBeenCalledWith("image");
		expect(mocks.saveSong).not.toHaveBeenCalled();
	});
	it("retains originals if metadata persistence fails after optimistic attachment", async () => {
		let snapshot = initial();
		mocks.saveSong.mockRejectedValue(new Error("Disk full"));
		const commitSnapshot: CommitSnapshot = async (update, persist) => {
			snapshot = update(snapshot);
			await persist(snapshot);
			return snapshot;
		};
		const { result } = renderHook(() =>
			useGalleryMutations({ cloud: null, commitSnapshot }),
		);
		await expect(
			result.current.addGalleryImages({ songId: "song" }, [
				new File(["x"], "master.png"),
			]),
		).rejects.toThrow("Disk full");
		expect(snapshot.songs[0]?.galleryImages).toEqual([image]);
		expect(mocks.deleteBlob).not.toHaveBeenCalled();
		expect(mocks.deleteRemote).not.toHaveBeenCalled();
	});
});
