import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
	hasRichTextContent,
	normalizeJournalText,
	normalizeRichText,
} from "./rich-text";
import {
	type Annotation,
	type AudioFileRecord,
	type AudioVersionsSettings,
	type AudioVersionsSnapshot,
	createEmptySettings,
	type Playlist,
	type RichTextDoc,
	type Song,
} from "./types";

interface AudioVersionsDB extends DBSchema {
	galleryBlobs: {
		key: string;
		value: { original: Blob; thumbnail: Blob };
	};
	songs: {
		key: string;
		value: Song;
	};
	audioFiles: {
		key: string;
		value: AudioFileRecord;
		indexes: { songId: string };
	};
	annotations: {
		key: string;
		value: Annotation;
		indexes: {
			songId: string;
			audioFileId: string;
		};
	};
	playlists: {
		key: string;
		value: Playlist;
	};
	blobs: {
		key: string;
		value: Blob;
	};
	settings: {
		key: string;
		value: AudioVersionsSettings;
	};
	sync: {
		key: string;
		value: string;
	};
}

const DB_NAME = "audio-versions";
const DB_VERSION = 8;
const SETTINGS_KEY = "app-settings";
const LOCAL_OWNER_KEY = "cloud-owner-id";
const IDENTITY_MIGRATION_KEY = "identity-migration-complete";
const PREVIOUS_DB_NAME = ["version", "compare"].join("-");
const LEGACY_POINT_ANNOTATION_COLOR = "var(--color-annotation-4)";
const LEGACY_RANGE_ANNOTATION_COLOR = "var(--color-annotation-2)";
const POINT_MARKER_COLOR = "var(--color-marker-point)";
const RANGE_MARKER_COLOR = "var(--color-marker-range)";

let dbPromise: Promise<IDBPDatabase<AudioVersionsDB>> | null = null;

type LegacyAudioFileRecord = AudioFileRecord & {
	masteringNote?: RichTextDoc | null;
};

type LegacySong = Omit<Song, "generalNotes"> & {
	generalNotes: string | RichTextDoc;
};

function openAudioVersionsDb(
	name: string,
): Promise<IDBPDatabase<AudioVersionsDB>> {
	return openDB<AudioVersionsDB>(name, DB_VERSION, {
		async upgrade(database, oldVersion, _newVersion, transaction) {
			if (!database.objectStoreNames.contains("galleryBlobs")) {
				database.createObjectStore("galleryBlobs");
			}
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

			if (!database.objectStoreNames.contains("playlists")) {
				database.createObjectStore("playlists", { keyPath: "id" });
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

			if (oldVersion < 2) {
				const audioFilesStore = transaction.objectStore("audioFiles");
				const audioFiles = await audioFilesStore.getAll();

				await Promise.all(
					audioFiles.map(async (audioFile) => {
						const legacyAudioFile = audioFile as LegacyAudioFileRecord;
						if (typeof legacyAudioFile.masteringNote === "undefined") {
							return;
						}

						const { masteringNote, ...restAudioFile } = legacyAudioFile;
						await audioFilesStore.put({
							...restAudioFile,
							notes: mergeAudioFileNotes(legacyAudioFile.notes, masteringNote),
						});
					}),
				);
			}

			if (oldVersion < 3) {
				const audioFilesStore = transaction.objectStore("audioFiles");
				const annotationsStore = transaction.objectStore("annotations");
				const [audioFiles, annotations] = await Promise.all([
					audioFilesStore.getAll(),
					annotationsStore.getAll(),
				]);

				await Promise.all([
					...audioFiles.map(async (audioFile) => {
						const sessionDate = normalizeStoredSessionDate(audioFile);
						if (audioFile.sessionDate === sessionDate) {
							return;
						}

						await audioFilesStore.put({
							...audioFile,
							sessionDate,
						});
					}),
					...annotations.map(async (annotation) => {
						const color = normalizeLegacyAnnotationColor(annotation.color);
						if (annotation.color === color) {
							return;
						}

						await annotationsStore.put({
							...annotation,
							color,
						});
					}),
				]);
			}

			if (oldVersion < 5) {
				const songsStore = transaction.objectStore("songs");
				const songs = (await songsStore.getAll()) as LegacySong[];

				await Promise.all(
					songs.map((song) =>
						songsStore.put({
							...song,
							generalNotes: normalizeJournalText(song.generalNotes),
						}),
					),
				);
			}

			if (oldVersion < 6) {
				await transaction.objectStore("annotations").clear();
			}
		},
	});
}

function databaseExists(name: string): Promise<boolean | null> {
	if (typeof indexedDB.databases !== "function") {
		return Promise.resolve(null);
	}

	return indexedDB.databases().then(
		(databases) => databases.some((database) => database.name === name),
		() => null,
	);
}

function deletePreviousDatabase(): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(PREVIOUS_DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

async function migratePreviousDatabase(
	database: IDBPDatabase<AudioVersionsDB>,
): Promise<void> {
	if ((await database.get("sync", IDENTITY_MIGRATION_KEY)) === "1") {
		return;
	}

	if ((await databaseExists(PREVIOUS_DB_NAME)) === false) {
		await database.put("sync", "1", IDENTITY_MIGRATION_KEY);
		return;
	}

	const previousDatabase = await openAudioVersionsDb(PREVIOUS_DB_NAME);
	let migrationCommitted = false;

	try {
		const [
			songs,
			audioFiles,
			annotations,
			playlists,
			blobKeys,
			blobs,
			settingsKeys,
			settings,
			syncKeys,
			syncValues,
		] = await Promise.all([
			previousDatabase.getAll("songs"),
			previousDatabase.getAll("audioFiles"),
			previousDatabase.getAll("annotations"),
			previousDatabase.objectStoreNames.contains("playlists")
				? previousDatabase.getAll("playlists")
				: Promise.resolve([]),
			previousDatabase.getAllKeys("blobs"),
			previousDatabase.getAll("blobs"),
			previousDatabase.getAllKeys("settings"),
			previousDatabase.getAll("settings"),
			previousDatabase.getAllKeys("sync"),
			previousDatabase.getAll("sync"),
		]);

		const transaction = database.transaction(
			[
				"songs",
				"audioFiles",
				"annotations",
				"playlists",
				"blobs",
				"settings",
				"sync",
			],
			"readwrite",
		);

		for (const song of songs) {
			await transaction.objectStore("songs").put(song);
		}
		for (const audioFile of audioFiles) {
			await transaction.objectStore("audioFiles").put(audioFile);
		}
		for (const annotation of annotations) {
			await transaction.objectStore("annotations").put(annotation);
		}
		for (const playlist of playlists) {
			await transaction.objectStore("playlists").put(playlist);
		}
		for (const [index, key] of blobKeys.entries()) {
			const blob = blobs[index];
			if (blob) {
				await transaction.objectStore("blobs").put(blob, key);
			}
		}
		for (const [index, key] of settingsKeys.entries()) {
			const setting = settings[index];
			if (setting) {
				await transaction.objectStore("settings").put(setting, key);
			}
		}
		for (const [index, key] of syncKeys.entries()) {
			const value = syncValues[index];
			if (value) {
				await transaction.objectStore("sync").put(value, key);
			}
		}

		await transaction.objectStore("sync").put("1", IDENTITY_MIGRATION_KEY);
		await transaction.done;
		migrationCommitted = true;
	} finally {
		previousDatabase.close();
		if (migrationCommitted) {
			await deletePreviousDatabase();
		}
	}
}

function getDb(): Promise<IDBPDatabase<AudioVersionsDB>> {
	dbPromise ??= openAudioVersionsDb(DB_NAME).then(async (database) => {
		await migratePreviousDatabase(database);
		return database;
	});

	return dbPromise;
}

export async function closeAudioVersionsDbForTests(): Promise<void> {
	if (!dbPromise) {
		return;
	}

	const db = await dbPromise;
	db.close();
	dbPromise = null;
}

export async function loadSnapshot(): Promise<AudioVersionsSnapshot> {
	const db = await getDb();
	const [songs, audioFiles, annotations, playlists, blobKeys, settings] =
		await Promise.all([
			db.getAll("songs"),
			db.getAll("audioFiles"),
			db.getAll("annotations"),
			db.getAll("playlists"),
			db.getAllKeys("blobs"),
			db.get("settings", SETTINGS_KEY),
		]);

	const blobEntries = await Promise.all(
		blobKeys
			.filter((key): key is string => typeof key === "string")
			.map(async (key) => [key, await db.get("blobs", key)] as const),
	);

	return {
		songs,
		audioFiles,
		annotations,
		playlists,
		blobsByAudioId: Object.fromEntries(
			blobEntries.filter(
				(entry): entry is [string, Blob] => entry[1] instanceof Blob,
			),
		),
		settings: settings ?? createEmptySettings(),
	};
}

export async function saveSong(song: Song): Promise<void> {
	const db = await getDb();
	await db.put("songs", song);
}

export async function saveAudioFile(audioFile: AudioFileRecord): Promise<void> {
	const db = await getDb();
	await db.put("audioFiles", audioFile);
}

export async function saveAudioBlob(
	audioFileId: string,
	blob: Blob,
	expectedMedia?: { ownerId: string; pathname: string },
): Promise<void> {
	const db = await getDb();
	if (expectedMedia) {
		const transaction = db.transaction(
			["blobs", "sync", "audioFiles"],
			"readwrite",
		);
		const owner = await transaction.objectStore("sync").get(LOCAL_OWNER_KEY);
		const file = await transaction.objectStore("audioFiles").get(audioFileId);
		if (
			owner === expectedMedia.ownerId &&
			file?.remoteMedia?.pathname === expectedMedia.pathname
		) {
			await transaction.objectStore("blobs").put(blob, audioFileId);
		}
		await transaction.done;
		return;
	}
	await db.put("blobs", blob, audioFileId);
}

export async function getAudioBlob(
	audioFileId: string,
): Promise<Blob | undefined> {
	const db = await getDb();
	return db.get("blobs", audioFileId);
}

export async function saveGalleryBlob(
	id: string,
	data: { original: Blob; thumbnail: Blob },
): Promise<void> {
	const db = await getDb();
	await db.put("galleryBlobs", data, id);
}

export async function getGalleryBlob(id: string) {
	const db = await getDb();
	return db.get("galleryBlobs", id);
}

export async function deleteGalleryBlob(id: string): Promise<void> {
	const db = await getDb();
	await db.delete("galleryBlobs", id);
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
	const db = await getDb();
	await db.put("annotations", annotation);
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
	const db = await getDb();
	await db.put("playlists", playlist);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
	const db = await getDb();
	await db.delete("playlists", playlistId);
}

interface DeleteAudioFileCascadeInput {
	audioFileId: string;
	annotationIds: string[];
	playlists?: Playlist[];
	settings: AudioVersionsSettings;
	song?: Song;
}

interface DeleteSongCascadeInput {
	songId: string;
	audioFileIds: string[];
	annotationIds: string[];
	playlists?: Playlist[];
	settings: AudioVersionsSettings;
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
	const db = await getDb();
	await db.delete("annotations", annotationId);
}

export async function saveSettings(
	settings: AudioVersionsSettings,
): Promise<void> {
	const db = await getDb();
	await db.put("settings", settings, SETTINGS_KEY);
}

export async function getLocalOwnerId(): Promise<string | null> {
	const db = await getDb();
	return (await db.get("sync", LOCAL_OWNER_KEY)) ?? null;
}

export async function replaceLocalSnapshot(
	snapshot: AudioVersionsSnapshot,
	ownerId: string,
): Promise<void> {
	const db = await getDb();
	const transaction = db.transaction(
		[
			"songs",
			"audioFiles",
			"annotations",
			"playlists",
			"blobs",
			"galleryBlobs",
			"settings",
			"sync",
		],
		"readwrite",
	);

	// Audio IDs identify immutable media. Keep existing blobs for this owner:
	// rewriting cached Blob handles on every realtime refresh can fail in Chromium.
	const blobsStore = transaction.objectStore("blobs");
	const [previousOwnerId, existingBlobKeys] = await Promise.all([
		transaction.objectStore("sync").get(LOCAL_OWNER_KEY),
		blobsStore.getAllKeys(),
	]);
	const retainedBlobIds = new Set(
		snapshot.audioFiles
			.filter(
				(audioFile) => snapshot.blobsByAudioId[audioFile.id] instanceof Blob,
			)
			.map((audioFile) => audioFile.id),
	);
	const cachedBlobIds = new Set(existingBlobKeys);
	const sameOwner = previousOwnerId === ownerId;
	for (const key of existingBlobKeys) {
		if (!sameOwner || !retainedBlobIds.has(key)) {
			await blobsStore.delete(key);
		}
	}

	const imageIds = new Set(
		[...snapshot.songs, ...snapshot.audioFiles].flatMap((record) =>
			(record.galleryImages ?? []).map((image) => image.id),
		),
	);
	const galleryStore = transaction.objectStore("galleryBlobs");
	for (const id of await galleryStore.getAllKeys()) {
		if (!sameOwner || !imageIds.has(id)) await galleryStore.delete(id);
	}

	await Promise.all([
		transaction.objectStore("songs").clear(),
		transaction.objectStore("audioFiles").clear(),
		transaction.objectStore("annotations").clear(),
		transaction.objectStore("playlists").clear(),
	]);

	for (const song of snapshot.songs) {
		await transaction.objectStore("songs").put(song);
	}
	for (const audioFile of snapshot.audioFiles) {
		await transaction.objectStore("audioFiles").put(audioFile);
		const blob = snapshot.blobsByAudioId[audioFile.id];
		if (
			blob instanceof Blob &&
			(!sameOwner || !cachedBlobIds.has(audioFile.id))
		) {
			await blobsStore.put(blob, audioFile.id);
		}
	}
	for (const annotation of snapshot.annotations) {
		await transaction.objectStore("annotations").put(annotation);
	}
	for (const playlist of snapshot.playlists) {
		await transaction.objectStore("playlists").put(playlist);
	}

	await transaction
		.objectStore("settings")
		.put(snapshot.settings, SETTINGS_KEY);
	await transaction.objectStore("sync").put(ownerId, LOCAL_OWNER_KEY);
	await transaction.done;
}

export async function deleteAudioFileCascade({
	audioFileId,
	annotationIds,
	playlists = [],
	settings,
	song,
}: DeleteAudioFileCascadeInput): Promise<void> {
	const db = await getDb();
	const transaction = db.transaction(
		[
			"audioFiles",
			"annotations",
			"blobs",
			"galleryBlobs",
			"playlists",
			"settings",
			"songs",
		],
		"readwrite",
	);

	const removedFile = await transaction
		.objectStore("audioFiles")
		.get(audioFileId);
	for (const image of removedFile?.galleryImages ?? [])
		await transaction.objectStore("galleryBlobs").delete(image.id);
	await transaction.objectStore("audioFiles").delete(audioFileId);
	await transaction.objectStore("blobs").delete(audioFileId);

	for (const annotationId of annotationIds) {
		await transaction.objectStore("annotations").delete(annotationId);
	}
	for (const playlist of playlists) {
		await transaction.objectStore("playlists").put(playlist);
	}

	if (song) {
		await transaction.objectStore("songs").put(song);
	}

	await transaction.objectStore("settings").put(settings, SETTINGS_KEY);
	await transaction.done;
}

export async function deleteSongCascade({
	songId,
	audioFileIds,
	annotationIds,
	playlists = [],
	settings,
}: DeleteSongCascadeInput): Promise<void> {
	const db = await getDb();
	const transaction = db.transaction(
		[
			"songs",
			"audioFiles",
			"annotations",
			"playlists",
			"blobs",
			"galleryBlobs",
			"settings",
		],
		"readwrite",
	);

	const removedSong = await transaction.objectStore("songs").get(songId);
	for (const image of removedSong?.galleryImages ?? [])
		await transaction.objectStore("galleryBlobs").delete(image.id);
	await transaction.objectStore("songs").delete(songId);

	for (const audioFileId of audioFileIds) {
		const removedFile = await transaction
			.objectStore("audioFiles")
			.get(audioFileId);
		for (const image of removedFile?.galleryImages ?? [])
			await transaction.objectStore("galleryBlobs").delete(image.id);
		await transaction.objectStore("audioFiles").delete(audioFileId);
		await transaction.objectStore("blobs").delete(audioFileId);
	}

	for (const annotationId of annotationIds) {
		await transaction.objectStore("annotations").delete(annotationId);
	}
	for (const playlist of playlists) {
		await transaction.objectStore("playlists").put(playlist);
	}

	await transaction.objectStore("settings").put(settings, SETTINGS_KEY);
	await transaction.done;
}

function mergeAudioFileNotes(
	notes?: RichTextDoc | null,
	legacyMasteringNote?: RichTextDoc | null,
): RichTextDoc {
	const normalizedNotes = normalizeRichText(notes);
	const normalizedLegacyMastering = normalizeRichText(legacyMasteringNote);

	if (!hasRichTextContent(normalizedNotes)) {
		return normalizedLegacyMastering;
	}

	if (!hasRichTextContent(normalizedLegacyMastering)) {
		return normalizedNotes;
	}

	return {
		type: "doc",
		content: [
			...(normalizedNotes.content ?? []),
			...(normalizedLegacyMastering.content ?? []),
		],
	};
}

function normalizeStoredSessionDate(
	audioFile: Pick<AudioFileRecord, "createdAt" | "sessionDate">,
): string {
	const explicit = audioFile.sessionDate?.trim() ?? "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
		return explicit;
	}

	const createdDatePart =
		audioFile.createdAt.length >= 10 ? audioFile.createdAt.slice(0, 10) : "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(createdDatePart)) {
		return createdDatePart;
	}

	return "1970-01-01";
}

function normalizeLegacyAnnotationColor(
	color: string | undefined,
): string | undefined {
	if (color === LEGACY_POINT_ANNOTATION_COLOR) {
		return POINT_MARKER_COLOR;
	}

	if (color === LEGACY_RANGE_ANNOTATION_COLOR) {
		return RANGE_MARKER_COLOR;
	}

	return color;
}
