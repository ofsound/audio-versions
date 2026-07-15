import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { hasRichTextContent, normalizeRichText } from "./rich-text";
import {
	type Annotation,
	type AudioFileRecord,
	createEmptySettings,
	type RichTextDoc,
	type Song,
	type SongModeSettings,
	type SongModeSnapshot,
} from "./types";

interface SongModeDB extends DBSchema {
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
		value: SongModeSettings;
	};
	sync: {
		key: string;
		value: string;
	};
}

const DB_NAME = "song-mode";
const DB_VERSION = 4;
const SETTINGS_KEY = "app-settings";
const LOCAL_OWNER_KEY = "cloud-owner-id";
const LEGACY_POINT_ANNOTATION_COLOR = "var(--color-annotation-4)";
const LEGACY_RANGE_ANNOTATION_COLOR = "var(--color-annotation-2)";
const POINT_MARKER_COLOR = "var(--color-marker-point)";
const RANGE_MARKER_COLOR = "var(--color-marker-range)";

let dbPromise: Promise<IDBPDatabase<SongModeDB>> | null = null;

type LegacyAudioFileRecord = AudioFileRecord & {
	masteringNote?: RichTextDoc | null;
};

function getDb(): Promise<IDBPDatabase<SongModeDB>> {
	dbPromise ??= openDB<SongModeDB>(DB_NAME, DB_VERSION, {
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
		},
	});

	return dbPromise;
}

export async function closeSongModeDbForTests(): Promise<void> {
	if (!dbPromise) {
		return;
	}

	const db = await dbPromise;
	db.close();
	dbPromise = null;
}

export async function loadSnapshot(): Promise<SongModeSnapshot> {
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

export async function saveAnnotation(annotation: Annotation): Promise<void> {
	const db = await getDb();
	await db.put("annotations", annotation);
}

interface DeleteAudioFileCascadeInput {
	audioFileId: string;
	annotationIds: string[];
	settings: SongModeSettings;
	song?: Song;
}

interface DeleteSongCascadeInput {
	songId: string;
	audioFileIds: string[];
	annotationIds: string[];
	settings: SongModeSettings;
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
	const db = await getDb();
	await db.delete("annotations", annotationId);
}

export async function saveSettings(settings: SongModeSettings): Promise<void> {
	const db = await getDb();
	await db.put("settings", settings, SETTINGS_KEY);
}

export async function getLocalOwnerId(): Promise<string | null> {
	const db = await getDb();
	return (await db.get("sync", LOCAL_OWNER_KEY)) ?? null;
}

export async function replaceLocalSnapshot(
	snapshot: SongModeSnapshot,
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
