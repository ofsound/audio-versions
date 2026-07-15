import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongModeSettings,
	SongModeSnapshot,
} from "#/lib/song-mode/types";

import { getSupabaseBrowserClient } from "./supabase";

interface SongRow {
	id: string;
	user_id: string;
	title: string;
	artist: string;
	project: string;
	general_notes: Song["generalNotes"];
	audio_file_order: string[];
	created_at: string;
	updated_at: string;
}

interface AudioFileRow {
	id: string;
	user_id: string;
	song_id: string;
	title: string;
	session_date: string;
	notes: AudioFileRecord["notes"];
	volume_db: number;
	duration_ms: number;
	waveform: AudioFileRecord["waveform"];
	blob_pathname: string | null;
	blob_content_type: string | null;
	blob_size: number | null;
	blob_original_name: string | null;
	created_at: string;
	updated_at: string;
}

interface AnnotationRow {
	id: string;
	user_id: string;
	song_id: string;
	audio_file_id: string;
	type: Annotation["type"];
	start_ms: number;
	end_ms: number | null;
	title: string;
	body: Annotation["body"];
	color: string | null;
	created_at: string;
	updated_at: string;
}

interface SettingsRow {
	settings: SongModeSettings;
}

interface CloudSnapshotResult {
	exists: boolean;
	snapshot: SongModeSnapshot;
}

export interface CloudPersistence {
	deleteAnnotation: (annotationId: string) => Promise<void>;
	deleteAudioFile: (audioFileId: string) => Promise<void>;
	deleteSong: (songId: string) => Promise<void>;
	saveAnnotation: (annotation: Annotation) => Promise<void>;
	saveAudioFile: (audioFile: AudioFileRecord) => Promise<void>;
	saveSettings: (settings: SongModeSettings) => Promise<void>;
	saveSong: (song: Song) => Promise<void>;
}

function requireClient() {
	const client = getSupabaseBrowserClient();
	if (!client) {
		throw new Error("Song Mode cloud sync is not configured.");
	}

	return client;
}

function songToRow(userId: string, song: Song) {
	return {
		id: song.id,
		user_id: userId,
		title: song.title,
		artist: song.artist,
		project: song.project,
		general_notes: song.generalNotes,
		audio_file_order: song.audioFileOrder,
		created_at: song.createdAt,
		updated_at: song.updatedAt,
		deleted_at: null,
	};
}

function audioFileToRow(userId: string, audioFile: AudioFileRecord) {
	return {
		id: audioFile.id,
		user_id: userId,
		song_id: audioFile.songId,
		title: audioFile.title,
		session_date: audioFile.sessionDate,
		notes: audioFile.notes,
		volume_db: audioFile.volumeDb,
		duration_ms: audioFile.durationMs,
		waveform: audioFile.waveform,
		blob_pathname: audioFile.remoteMedia?.pathname ?? null,
		blob_content_type: audioFile.remoteMedia?.contentType ?? null,
		blob_size: audioFile.remoteMedia?.size ?? null,
		blob_original_name: audioFile.remoteMedia?.originalName ?? null,
		created_at: audioFile.createdAt,
		updated_at: audioFile.updatedAt,
		deleted_at: null,
	};
}

function annotationToRow(userId: string, annotation: Annotation) {
	return {
		id: annotation.id,
		user_id: userId,
		song_id: annotation.songId,
		audio_file_id: annotation.audioFileId,
		type: annotation.type,
		start_ms: annotation.startMs,
		end_ms: annotation.endMs ?? null,
		title: annotation.title,
		body: annotation.body,
		color: annotation.color ?? null,
		created_at: annotation.createdAt,
		updated_at: annotation.updatedAt,
		deleted_at: null,
	};
}

function songFromRow(row: SongRow): Song {
	return {
		id: row.id,
		title: row.title,
		artist: row.artist,
		project: row.project,
		generalNotes: row.general_notes,
		audioFileOrder: row.audio_file_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function audioFileFromRow(row: AudioFileRow): AudioFileRecord {
	const hasRemoteMedia = Boolean(
		row.blob_pathname &&
			row.blob_content_type &&
			row.blob_size != null &&
			row.blob_original_name,
	);

	return {
		id: row.id,
		songId: row.song_id,
		title: row.title,
		sessionDate: row.session_date,
		notes: row.notes,
		volumeDb: row.volume_db,
		durationMs: row.duration_ms,
		waveform: row.waveform,
		...(hasRemoteMedia
			? {
					remoteMedia: {
						pathname: row.blob_pathname as string,
						contentType: row.blob_content_type as string,
						size: row.blob_size as number,
						originalName: row.blob_original_name as string,
					},
				}
			: {}),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function annotationFromRow(row: AnnotationRow): Annotation {
	return {
		id: row.id,
		songId: row.song_id,
		audioFileId: row.audio_file_id,
		type: row.type,
		startMs: row.start_ms,
		...(row.end_ms == null ? {} : { endMs: row.end_ms }),
		title: row.title,
		body: row.body,
		...(row.color == null ? {} : { color: row.color }),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function throwIfError(error: { message: string } | null): void {
	if (error) {
		throw new Error(error.message);
	}
}

export function createCloudPersistence(userId: string): CloudPersistence {
	const client = requireClient();

	return {
		async saveSong(song) {
			const { error } = await client
				.from("songs")
				.upsert(songToRow(userId, song));
			throwIfError(error);
		},
		async saveAudioFile(audioFile) {
			const { error } = await client
				.from("audio_files")
				.upsert(audioFileToRow(userId, audioFile));
			throwIfError(error);
		},
		async saveAnnotation(annotation) {
			const { error } = await client
				.from("annotations")
				.upsert(annotationToRow(userId, annotation));
			throwIfError(error);
		},
		async saveSettings(settings) {
			const { error } = await client.from("user_settings").upsert({
				user_id: userId,
				settings,
				updated_at: new Date().toISOString(),
			});
			throwIfError(error);
		},
		async deleteAnnotation(annotationId) {
			const now = new Date().toISOString();
			const { error } = await client
				.from("annotations")
				.update({ deleted_at: now, updated_at: now })
				.eq("user_id", userId)
				.eq("id", annotationId);
			throwIfError(error);
		},
		async deleteAudioFile(audioFileId) {
			const now = new Date().toISOString();
			const [annotationResult, audioFileResult] = await Promise.all([
				client
					.from("annotations")
					.update({ deleted_at: now, updated_at: now })
					.eq("user_id", userId)
					.eq("audio_file_id", audioFileId),
				client
					.from("audio_files")
					.update({ deleted_at: now, updated_at: now })
					.eq("user_id", userId)
					.eq("id", audioFileId),
			]);
			throwIfError(annotationResult.error);
			throwIfError(audioFileResult.error);
		},
		async deleteSong(songId) {
			const now = new Date().toISOString();
			const [annotationResult, audioFileResult, songResult] = await Promise.all(
				[
					client
						.from("annotations")
						.update({ deleted_at: now, updated_at: now })
						.eq("user_id", userId)
						.eq("song_id", songId),
					client
						.from("audio_files")
						.update({ deleted_at: now, updated_at: now })
						.eq("user_id", userId)
						.eq("song_id", songId),
					client
						.from("songs")
						.update({ deleted_at: now, updated_at: now })
						.eq("user_id", userId)
						.eq("id", songId),
				],
			);
			throwIfError(annotationResult.error);
			throwIfError(audioFileResult.error);
			throwIfError(songResult.error);
		},
	};
}

export async function loadCloudSnapshot(
	userId: string,
): Promise<CloudSnapshotResult> {
	const client = requireClient();
	const [songsResult, audioFilesResult, annotationsResult, settingsResult] =
		await Promise.all([
			client
				.from("songs")
				.select("*")
				.eq("user_id", userId)
				.is("deleted_at", null),
			client
				.from("audio_files")
				.select("*")
				.eq("user_id", userId)
				.is("deleted_at", null),
			client
				.from("annotations")
				.select("*")
				.eq("user_id", userId)
				.is("deleted_at", null),
			client
				.from("user_settings")
				.select("settings")
				.eq("user_id", userId)
				.maybeSingle(),
		]);

	throwIfError(songsResult.error);
	throwIfError(audioFilesResult.error);
	throwIfError(annotationsResult.error);
	throwIfError(settingsResult.error);

	const songRows = (songsResult.data ?? []) as SongRow[];
	const audioFileRows = (audioFilesResult.data ?? []) as AudioFileRow[];
	const annotationRows = (annotationsResult.data ?? []) as AnnotationRow[];
	const settingsRow = settingsResult.data as SettingsRow | null;

	return {
		exists:
			songRows.length > 0 ||
			audioFileRows.length > 0 ||
			annotationRows.length > 0 ||
			settingsRow != null,
		snapshot: {
			songs: songRows.map(songFromRow),
			audioFiles: audioFileRows.map(audioFileFromRow),
			annotations: annotationRows.map(annotationFromRow),
			blobsByAudioId: {},
			settings: settingsRow?.settings ?? {
				recents: [],
				workspaceBySongId: {},
				ui: {
					accentLightPrimary: "#059669",
					accentLightStrong: "#0284c7",
					accentDarkPrimary: "#6ee7b7",
					accentDarkStrong: "#38bdf8",
					waveformHeight: "large",
					waveformLayout: "stacked",
					showArtist: true,
					showProject: true,
					keyboardFocusHighlights: false,
				},
			},
		},
	};
}

export async function uploadCloudSnapshot(
	userId: string,
	snapshot: SongModeSnapshot,
): Promise<void> {
	const cloud = createCloudPersistence(userId);
	await Promise.all(snapshot.songs.map(cloud.saveSong));
	await Promise.all(snapshot.audioFiles.map(cloud.saveAudioFile));
	await Promise.all(snapshot.annotations.map(cloud.saveAnnotation));
	await cloud.saveSettings(snapshot.settings);
}

export function subscribeToCloudChanges(
	userId: string,
	onChange: () => void,
): () => void {
	const client = requireClient();
	const channel = client
		.channel(`song-mode:${userId}`)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "songs",
				filter: `user_id=eq.${userId}`,
			},
			onChange,
		)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "audio_files",
				filter: `user_id=eq.${userId}`,
			},
			onChange,
		)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "annotations",
				filter: `user_id=eq.${userId}`,
			},
			onChange,
		)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "user_settings",
				filter: `user_id=eq.${userId}`,
			},
			onChange,
		)
		.subscribe();

	return () => {
		void client.removeChannel(channel);
	};
}
