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
	type RichTextDoc,
	type Song,
} from "./types";

interface AudioVersionsDB extends DBSchema {
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
const DB_VERSION = 6;
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
			previousDatabase.getAllKeys("blobs"),
			previousDatabase.getAll("blobs"),
			previousDatabase.getAllKeys("settings"),
			previousDatabase.getAll("settings"),
			previousDatabase.getAllKeys("sync"),
			previousDatabase.getAll("sync"),
		]);

		const transaction = database.transaction(
			["songs", "audioFiles", "annotations", "blobs", "settings", "sync"],
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
	const [songs, audioFiles, annotations, blobKeys, settings] =
		await Promise.all([
			db.getAll("songs"),
			db.getAll("audioFiles"),
			db.getAll("annotations"),
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
): Promise<void> {
	const db = await getDb();
	await db.put("blobs", blob, audioFileId);
}

export async function getAudioBlob(
	audioFileId: string,
): Promise<Blob | undefined> {
	const db = await getDb();
	return db.get("blobs", audioFileId);
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
	const db = await getDb();
	await db.put("annotations", annotation);
}

interface DeleteAudioFileCascadeInput {
	audioFileId: string;
	annotationIds: string[];
	settings: AudioVersionsSettings;
	song?: Song;
}

interface DeleteSongCascadeInput {
	songId: string;
	audioFileIds: string[];
	annotationIds: string[];
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
		["songs", "audioFiles", "annotations", "blobs", "settings", "sync"],
		"readwrite",
	);

	await Promise.all([
		transaction.objectStore("songs").clear(),
		transaction.objectStore("audioFiles").clear(),
		transaction.objectStore("annotations").clear(),
		transaction.objectStore("blobs").clear(),
	]);

	for (const song of snapshot.songs) {
		await transaction.objectStore("songs").put(song);
	}
	for (const audioFile of snapshot.audioFiles) {
		await transaction.objectStore("audioFiles").put(audioFile);
		const blob = snapshot.blobsByAudioId[audioFile.id];
		if (blob instanceof Blob) {
			await transaction.objectStore("blobs").put(blob, audioFile.id);
		}
	}
	for (const annotation of snapshot.annotations) {
		await transaction.objectStore("annotations").put(annotation);
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
	settings,
	song,
}: DeleteAudioFileCascadeInput): Promise<void> {
	const db = await getDb();
	const transaction = db.transaction(
		["audioFiles", "annotations", "blobs", "settings", "songs"],
		"readwrite",
	);

	await transaction.objectStore("audioFiles").delete(audioFileId);
	await transaction.objectStore("blobs").delete(audioFileId);

	for (const annotationId of annotationIds) {
		await transaction.objectStore("annotations").delete(annotationId);
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
	settings,
}: DeleteSongCascadeInput): Promise<void> {
	const db = await getDb();
	const transaction = db.transaction(
		["songs", "audioFiles", "annotations", "blobs", "settings"],
		"readwrite",
	);

	await transaction.objectStore("songs").delete(songId);

	for (const audioFileId of audioFileIds) {
		await transaction.objectStore("audioFiles").delete(audioFileId);
		await transaction.objectStore("blobs").delete(audioFileId);
	}

	for (const annotationId of annotationIds) {
		await transaction.objectStore("annotations").delete(annotationId);
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
