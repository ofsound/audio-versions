import {
	normalizeJournalText,
	normalizeRichText,
} from "#/lib/audio-versions/rich-text";
import {
	type AudioFileRecord,
	type AudioVersionsSnapshot,
	createEmptySettings,
	normalizeAudioVersionsSettings,
} from "#/lib/audio-versions/types";
import {
	generateWaveformFromFile,
	hasRenderableWaveform,
	normalizeVolumeDb,
	normalizeWaveformData,
} from "#/lib/audio-versions/waveform";

export const EMPTY_SNAPSHOT: AudioVersionsSnapshot = {
	songs: [],
	audioFiles: [],
	annotations: [],
	blobsByAudioId: {},
	settings: createEmptySettings(),
};

export async function normalizeLoadedSnapshot(
	loadedSnapshot: AudioVersionsSnapshot,
) {
	const audioFilesToPersist: AudioFileRecord[] = [];
	const audioFiles = await Promise.all(
		loadedSnapshot.audioFiles.map(async (audioFile) => {
			const normalizedAudioFile: AudioFileRecord = {
				...audioFile,
				sessionDate: normalizeLoadedSessionDate(audioFile),
				notes: normalizeRichText(audioFile.notes),
				volumeDb: normalizeVolumeDb(audioFile.volumeDb),
				waveform: normalizeWaveformData(
					audioFile.waveform,
					audioFile.durationMs,
				),
			};

			if (hasRenderableWaveform(audioFile.waveform)) {
				return normalizedAudioFile;
			}

			const blob = loadedSnapshot.blobsByAudioId[audioFile.id];
			if (!(blob instanceof Blob)) {
				return normalizedAudioFile;
			}

			try {
				const repairedWaveform = await generateWaveformFromFile(blob);
				const repairedAudioFile: AudioFileRecord = {
					...normalizedAudioFile,
					durationMs: repairedWaveform.durationMs,
					waveform: repairedWaveform,
				};
				audioFilesToPersist.push(repairedAudioFile);
				return repairedAudioFile;
			} catch {
				return normalizedAudioFile;
			}
		}),
	);

	return {
		audioFilesToPersist,
		normalizedSnapshot: {
			...loadedSnapshot,
			songs: loadedSnapshot.songs.map((song) => ({
				id: song.id,
				title: song.title,
				artist: song.artist,
				project: song.project,
				generalNotes: normalizeJournalText(song.generalNotes),
				audioFileOrder: song.audioFileOrder,
				createdAt: song.createdAt,
				updatedAt: song.updatedAt,
			})),
			audioFiles,
			annotations: loadedSnapshot.annotations.map((annotation) => ({
				...annotation,
				body: normalizeRichText(annotation.body),
			})),
			settings: normalizeAudioVersionsSettings(
				loadedSnapshot.settings ?? createEmptySettings(),
			),
		},
	};
}

function normalizeLoadedSessionDate(
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
