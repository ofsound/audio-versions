import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT, plainTextToRichText } from "./rich-text";
import type {
	Annotation,
	AudioFileRecord,
	AudioVersionsSettings,
	Playlist,
	Song,
} from "./types";
import { createEmptySettings } from "./types";

const DB_NAME = "audio-versions";
const PREVIOUS_DB_NAME = ["version", "compare"].join("-");

function deleteDatabase(name: string) {
	return new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error("Audio Versions test database is blocked."));
	});
}

function deleteAudioVersionsDatabases() {
	return Promise.all([
		deleteDatabase(DB_NAME),
		deleteDatabase(PREVIOUS_DB_NAME),
	]);
}

async function loadDbModule() {
	return import("./db");
}

function openLegacyAudioVersionsDatabase(
	version: number,
	name = DB_NAME,
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, version);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains("songs")) {
				database.createObjectStore("songs", { keyPath: "id" });
			}
			if (!database.objectStoreNames.contains("audioFiles")) {
				const audioFilesStore = database.createObjectStore("audioFiles", {
					keyPath: "id",
				});
				audioFilesStore.createIndex("songId", "songId");
			}
			if (!database.objectStoreNames.contains("annotations")) {
				const annotationsStore = database.createObjectStore("annotations", {
					keyPath: "id",
				});
				annotationsStore.createIndex("songId", "songId");
				annotationsStore.createIndex("audioFileId", "audioFileId");
			}
			if (!database.objectStoreNames.contains("blobs")) {
				database.createObjectStore("blobs");
			}
			if (!database.objectStoreNames.contains("settings")) {
				database.createObjectStore("settings");
			}
			if (!database.objectStoreNames.contains("sync")) {
				database.createObjectStore("sync");
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

function createSong(overrides: Partial<Song> = {}): Song {
	return {
		id: "song-1",
		title: "Song",
		artist: "Artist",
		project: "Project",
		generalNotes: "",
		audioFileOrder: ["file-1"],
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: "song-1",
		title: "Take 1",
		sessionDate: "2026-04-16",
		notes: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 1000,
		waveform: {
			peaks: [0.2],
			peakCount: 1,
			durationMs: 1000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function createAnnotation(overrides: Partial<Annotation> = {}): Annotation {
	return {
		id: "annotation-1",
		songId: "song-1",
		audioFileId: "file-1",
		type: "point",
		startMs: 100,
		detail: plainTextToRichText("Cue"),
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

const baseSettings: AudioVersionsSettings = {
	recents: ["song-1"],
	lastOpenSongId: "song-1",
	workspaceBySongId: {
		"song-1": {
			playheadMsByFileId: {
				"file-1": 5000,
			},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		},
	},
	ui: createEmptySettings().ui,
};

describe("audio-versions db cascade helpers", () => {
	beforeEach(async () => {
		vi.resetModules();
		const db = await loadDbModule();
		await db.closeAudioVersionsDbForTests();
		await deleteAudioVersionsDatabases();
		vi.resetModules();
	});

	afterEach(async () => {
		const db = await loadDbModule();
		await db.closeAudioVersionsDbForTests();
		await deleteAudioVersionsDatabases();
		vi.resetModules();
	});

	it("moves records from the previous identity database and removes it", async () => {
		const previousDatabase = await openLegacyAudioVersionsDatabase(
			4,
			PREVIOUS_DB_NAME,
		);
		const song = createSong();
		const audioFile = createAudioFile();
		const annotation = createAnnotation();
		const blob = new Blob(["wave"], { type: "audio/wav" });
		const transaction = previousDatabase.transaction(
			["songs", "audioFiles", "annotations", "blobs", "settings", "sync"],
			"readwrite",
		);

		transaction.objectStore("songs").put(song);
		transaction.objectStore("audioFiles").put(audioFile);
		transaction.objectStore("annotations").put(annotation);
		transaction.objectStore("blobs").put(blob, audioFile.id);
		transaction.objectStore("settings").put(baseSettings, "app-settings");
		transaction.objectStore("sync").put("user-1", "cloud-owner-id");
		await waitForTransaction(transaction);
		previousDatabase.close();

		const db = await loadDbModule();
		const snapshot = await db.loadSnapshot();

		expect(snapshot.songs).toEqual([song]);
		expect(snapshot.audioFiles).toEqual([audioFile]);
		expect(snapshot.annotations).toEqual([]);
		expect(snapshot.blobsByAudioId).toEqual({ [audioFile.id]: blob });
		expect(snapshot.settings).toEqual(baseSettings);
		expect(await db.getLocalOwnerId()).toBe("user-1");
		expect(
			(await indexedDB.databases()).some(
				(database) => database.name === PREVIOUS_DB_NAME,
			),
		).toBe(false);
	});

	it("atomically deletes an audio file and related records", async () => {
		const db = await loadDbModule();
		const song = createSong();
		const audioFile = createAudioFile();
		const annotation = createAnnotation();

		await db.saveSong(song);
		await db.saveAudioFile(audioFile);
		await db.saveAudioBlob(
			audioFile.id,
			new Blob(["wave"], { type: "audio/wav" }),
		);
		await db.saveAnnotation(annotation);
		await db.saveSettings(baseSettings);

		await db.deleteAudioFileCascade({
			audioFileId: audioFile.id,
			annotationIds: [annotation.id],
			settings: {
				...baseSettings,
				workspaceBySongId: {
					"song-1": {
						...baseSettings.workspaceBySongId["song-1"],
						playheadMsByFileId: {},
					},
				},
			},
			song: createSong({
				audioFileOrder: [],
				updatedAt: "2026-04-17T00:00:00.000Z",
			}),
		});

		const snapshot = await db.loadSnapshot();

		expect(snapshot.audioFiles).toEqual([]);
		expect(snapshot.annotations).toEqual([]);
		expect(snapshot.blobsByAudioId).toEqual({});
		expect(snapshot.songs[0]?.audioFileOrder).toEqual([]);
		expect(
			snapshot.settings.workspaceBySongId["song-1"]?.playheadMsByFileId,
		).toEqual({});
	});

	it("atomically deletes a song and all related records", async () => {
		const db = await loadDbModule();
		const song = createSong();
		const audioFile = createAudioFile();
		const annotation = createAnnotation();

		await db.saveSong(song);
		await db.saveAudioFile(audioFile);
		await db.saveAudioBlob(
			audioFile.id,
			new Blob(["wave"], { type: "audio/wav" }),
		);
		await db.saveAnnotation(annotation);
		await db.saveSettings(baseSettings);

		await db.deleteSongCascade({
			songId: song.id,
			audioFileIds: [audioFile.id],
			annotationIds: [annotation.id],
			settings: {
				recents: [],
				lastOpenSongId: undefined,
				workspaceBySongId: {},
				ui: createEmptySettings().ui,
			},
		});

		const snapshot = await db.loadSnapshot();

		expect(snapshot.songs).toEqual([]);
		expect(snapshot.audioFiles).toEqual([]);
		expect(snapshot.annotations).toEqual([]);
		expect(snapshot.blobsByAudioId).toEqual({});
		expect(snapshot.settings).toEqual({
			recents: [],
			lastOpenSongId: undefined,
			workspaceBySongId: {},
			ui: createEmptySettings().ui,
		});
	});

	it("upgrades missing session dates and clears pre-detail annotations", async () => {
		const legacyDb = await openLegacyAudioVersionsDatabase(2);
		const legacyAudioFile = createAudioFile();
		const { sessionDate: _sessionDate, ...legacyAudioFileWithoutSessionDate } =
			legacyAudioFile;
		const transaction = legacyDb.transaction(
			["songs", "audioFiles", "annotations", "settings"],
			"readwrite",
		);

		transaction.objectStore("songs").put(createSong());
		transaction
			.objectStore("audioFiles")
			.put(legacyAudioFileWithoutSessionDate as AudioFileRecord);
		transaction.objectStore("annotations").put(
			createAnnotation({
				color: "var(--color-annotation-4)",
			}),
		);
		transaction.objectStore("settings").put(baseSettings, "app-settings");
		await waitForTransaction(transaction);
		legacyDb.close();

		const db = await loadDbModule();
		const snapshot = await db.loadSnapshot();

		expect(snapshot.audioFiles).toEqual([
			expect.objectContaining({
				id: legacyAudioFile.id,
				sessionDate: "2026-04-16",
			}),
		]);
		expect(snapshot.annotations).toEqual([]);
	});

	it("converts cached rich-text journals to plain text in v5", async () => {
		const legacyDb = await openLegacyAudioVersionsDatabase(4);
		const transaction = legacyDb.transaction("songs", "readwrite");
		transaction.objectStore("songs").put({
			...createSong(),
			generalNotes: plainTextToRichText(
				"First paragraph\nwith a break\n\nSecond paragraph",
			),
		});
		await waitForTransaction(transaction);
		legacyDb.close();

		const db = await loadDbModule();
		const snapshot = await db.loadSnapshot();

		expect(snapshot.songs[0]?.generalNotes).toBe(
			"First paragraph\nwith a break\n\nSecond paragraph",
		);
	});

	it("replaces an account cache atomically and records its owner", async () => {
		const db = await loadDbModule();
		await db.saveSong(createSong({ id: "old-song" }));
		await db.saveAudioBlob(
			"old-file",
			new Blob(["old"], { type: "audio/wav" }),
		);

		const song = createSong({ id: "new-song", audioFileOrder: ["new-file"] });
		const audioFile = createAudioFile({
			id: "new-file",
			songId: song.id,
			remoteMedia: {
				pathname: "users/user-1/audio/new-file/take.wav",
				contentType: "audio/wav",
				size: 4,
				originalName: "take.wav",
			},
		});
		const blob = new Blob(["wave"], { type: "audio/wav" });
		const playlist: Playlist = {
			id: "playlist-1",
			name: "References",
			audioFileIds: [audioFile.id],
			sortOrder: 0,
			createdAt: "2026-08-02T00:00:00.000Z",
			updatedAt: "2026-08-02T00:00:00.000Z",
		};

		await db.replaceLocalSnapshot(
			{
				songs: [song],
				audioFiles: [audioFile],
				annotations: [],
				playlists: [playlist],
				blobsByAudioId: { [audioFile.id]: blob },
				settings: baseSettings,
			},
			"user-1",
		);

		const snapshot = await db.loadSnapshot();
		expect(await db.getLocalOwnerId()).toBe("user-1");
		expect(snapshot.songs.map((entry) => entry.id)).toEqual(["new-song"]);
		expect(snapshot.audioFiles[0]?.remoteMedia).toEqual(audioFile.remoteMedia);
		expect(snapshot.playlists).toEqual([playlist]);
		expect(snapshot.blobsByAudioId).toEqual({ [audioFile.id]: blob });
	});

	it("refreshes metadata without rewriting retained audio blobs", async () => {
		const db = await loadDbModule();
		const audioFile = createAudioFile();
		const blob = new Blob(["wave"], { type: "audio/wav" });
		const initial = {
			songs: [createSong()],
			audioFiles: [audioFile],
			annotations: [],
			playlists: [],
			blobsByAudioId: { [audioFile.id]: blob },
			settings: baseSettings,
		};
		await db.replaceLocalSnapshot(initial, "user-1");
		await db.saveAudioBlob("removed-file", new Blob(["removed"]));
		const cached = await db.loadSnapshot();
		const putSpy = vi.spyOn(IDBObjectStore.prototype, "put");
		const clearSpy = vi.spyOn(IDBObjectStore.prototype, "clear");
		try {
			await db.replaceLocalSnapshot(
				{
					...cached,
					audioFiles: [{ ...audioFile, title: "Renamed take" }],
					blobsByAudioId: {
						[audioFile.id]: cached.blobsByAudioId[audioFile.id],
					},
				},
				"user-1",
			);
			expect(
				putSpy.mock.contexts.some(
					(store) => store instanceof IDBObjectStore && store.name === "blobs",
				),
			).toBe(false);
			expect(
				clearSpy.mock.contexts.some(
					(store) => store instanceof IDBObjectStore && store.name === "blobs",
				),
			).toBe(false);
			const refreshed = await db.loadSnapshot();
			expect(refreshed.audioFiles[0]?.title).toBe("Renamed take");
			expect(await refreshed.blobsByAudioId[audioFile.id]?.text()).toBe("wave");
			expect(await db.getAudioBlob("removed-file")).toBeUndefined();
		} finally {
			putSpy.mockRestore();
			clearSpy.mockRestore();
		}
	});

	it("replaces cached media when switching owners even if audio IDs match", async () => {
		const db = await loadDbModule();
		const initial = {
			songs: [createSong()],
			audioFiles: [createAudioFile()],
			annotations: [],
			playlists: [],
			blobsByAudioId: { "file-1": new Blob(["first owner"]) },
			settings: baseSettings,
		};
		await db.replaceLocalSnapshot(initial, "user-1");
		await db.replaceLocalSnapshot(
			{ ...initial, blobsByAudioId: { "file-1": new Blob(["second owner"]) } },
			"user-2",
		);
		expect(await db.getLocalOwnerId()).toBe("user-2");
		expect(await (await db.getAudioBlob("file-1"))?.text()).toBe(
			"second owner",
		);
	});
	it("upgrades version 7 and isolates gallery originals by account", async () => {
		const legacy = await openLegacyAudioVersionsDatabase(7);
		const tx = legacy.transaction("songs", "readwrite");
		tx.objectStore("songs").put(createSong());
		await waitForTransaction(tx);
		legacy.close();
		const db = await loadDbModule();
		expect((await db.loadSnapshot()).songs[0]?.title).toBe("Song");
		const image = {
			id: "image",
			name: "screenshot.png",
			contentType: "image/png",
			size: 8,
			width: 800,
			height: 600,
			createdAt: "today",
		};
		const snapshot = {
			...(await db.loadSnapshot()),
			songs: [createSong({ galleryImages: [image] })],
		};
		await db.replaceLocalSnapshot(snapshot, "owner");
		await db.saveGalleryBlob(image.id, {
			original: new Blob(["original"]),
			thumbnail: new Blob(["thumb"]),
		});
		await db.replaceLocalSnapshot(snapshot, "owner");
		expect(await (await db.getGalleryBlob(image.id))?.original.text()).toBe(
			"original",
		);
		await db.replaceLocalSnapshot(snapshot, "another-owner");
		expect(await db.getGalleryBlob(image.id)).toBeUndefined();
	});

	it("deletes file and song gallery caches with their parents", async () => {
		const db = await loadDbModule();
		const image = {
			id: "song-image",
			name: "screenshot.png",
			contentType: "image/png",
			size: 8,
			width: 800,
			height: 600,
			createdAt: "today",
		};
		const song = createSong({ galleryImages: [image] });
		const file = createAudioFile({
			galleryImages: [{ ...image, id: "file-image" }],
		});
		await db.saveSong(song);
		await db.saveAudioFile(file);
		for (const id of ["song-image", "file-image"])
			await db.saveGalleryBlob(id, {
				original: new Blob([id]),
				thumbnail: new Blob([id]),
			});
		await db.deleteAudioFileCascade({
			audioFileId: file.id,
			annotationIds: [],
			settings: baseSettings,
		});
		expect(await db.getGalleryBlob("file-image")).toBeUndefined();
		expect(await db.getGalleryBlob("song-image")).toBeDefined();
		await db.deleteSongCascade({
			songId: song.id,
			audioFileIds: [],
			annotationIds: [],
			settings: baseSettings,
		});
		expect(await db.getGalleryBlob("song-image")).toBeUndefined();
	});
});
