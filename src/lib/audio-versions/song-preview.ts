import type { AudioFileRecord, Song } from "./types";

export function getSongPreviewFile(
	song: Song,
	audioFiles: AudioFileRecord[],
): AudioFileRecord | undefined {
	const files = audioFiles.filter((file) => file.songId === song.id);
	return (
		files.find((file) => file.id === song.starredAudioFileId) ??
		files.reduce<AudioFileRecord | undefined>(
			(latest, file) =>
				!latest || file.createdAt > latest.createdAt ? file : latest,
			undefined,
		)
	);
}
