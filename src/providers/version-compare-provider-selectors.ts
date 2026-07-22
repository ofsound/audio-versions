import { useCallback, useMemo } from "react";
import {
	type AudioFileRecord,
	createDefaultWorkspaceState,
	type Song,
	type VersionCompareSnapshot,
} from "#/lib/version-compare/types";

interface UseVersionCompareSelectorsOptions {
	snapshot: VersionCompareSnapshot;
}

function sortSongAudioFiles(
	song: Song | undefined,
	audioFiles: AudioFileRecord[],
) {
	const order = song?.audioFileOrder ?? [];

	return [...audioFiles].sort((left, right) => {
		const leftIndex = order.indexOf(left.id);
		const rightIndex = order.indexOf(right.id);

		if (leftIndex === -1 && rightIndex === -1) {
			return left.createdAt.localeCompare(right.createdAt);
		}

		if (leftIndex === -1) {
			return 1;
		}

		if (rightIndex === -1) {
			return -1;
		}

		return leftIndex - rightIndex;
	});
}

export function useVersionCompareSelectors({
	snapshot,
}: UseVersionCompareSelectorsOptions) {
	const songsById = useMemo(
		() => new Map(snapshot.songs.map((song) => [song.id, song])),
		[snapshot.songs],
	);
	const audioFilesById = useMemo(
		() =>
			new Map(
				snapshot.audioFiles.map((audioFile) => [audioFile.id, audioFile]),
			),
		[snapshot.audioFiles],
	);
	const audioFilesBySongId = useMemo(() => {
		const entries = new Map<string, AudioFileRecord[]>();

		for (const audioFile of snapshot.audioFiles) {
			const songAudioFiles = entries.get(audioFile.songId) ?? [];
			songAudioFiles.push(audioFile);
			entries.set(audioFile.songId, songAudioFiles);
		}

		for (const [songId, songAudioFiles] of entries) {
			entries.set(
				songId,
				sortSongAudioFiles(songsById.get(songId), songAudioFiles),
			);
		}

		return entries;
	}, [snapshot.audioFiles, songsById]);
	const annotationsByFileId = useMemo(() => {
		const entries = new Map<string, VersionCompareSnapshot["annotations"]>();

		for (const annotation of snapshot.annotations) {
			const fileAnnotations = entries.get(annotation.audioFileId) ?? [];
			fileAnnotations.push(annotation);
			entries.set(annotation.audioFileId, fileAnnotations);
		}

		for (const fileAnnotations of entries.values()) {
			fileAnnotations.sort((left, right) => left.startMs - right.startMs);
		}

		return entries;
	}, [snapshot.annotations]);

	const getSongById = useCallback(
		(songId: string) => songsById.get(songId),
		[songsById],
	);

	const getAudioFileById = useCallback(
		(fileId: string) => audioFilesById.get(fileId),
		[audioFilesById],
	);

	const getSongAudioFiles = useCallback(
		(songId: string) => audioFilesBySongId.get(songId) ?? [],
		[audioFilesBySongId],
	);

	const getAnnotationsForFile = useCallback(
		(audioFileId: string) => annotationsByFileId.get(audioFileId) ?? [],
		[annotationsByFileId],
	);

	const getWorkspaceState = useCallback(
		(songId: string) =>
			snapshot.settings.workspaceBySongId[songId] ??
			createDefaultWorkspaceState(),
		[snapshot.settings.workspaceBySongId],
	);

	return useMemo(
		() => ({
			getAnnotationsForFile,
			getAudioFileById,
			getSongAudioFiles,
			getSongById,
			getWorkspaceState,
		}),
		[
			getAnnotationsForFile,
			getAudioFileById,
			getSongAudioFiles,
			getSongById,
			getWorkspaceState,
		],
	);
}
