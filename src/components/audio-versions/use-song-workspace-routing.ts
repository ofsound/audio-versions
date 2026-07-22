import type { NavigateFn } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { targetToRouteSearch } from "#/lib/audio-versions/links";
import { findCrossedAnnotation } from "#/lib/audio-versions/playback";
import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongLinkTarget,
	SongRouteSearch,
} from "#/lib/audio-versions/types";
import type { PlaybackState } from "#/providers/use-audio-versions-playback";

interface UseSongWorkspaceRoutingOptions {
	audioFiles: AudioFileRecord[];
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	navigate: NavigateFn;
	playback: PlaybackState;
	ready: boolean;
	rememberSongOpened: (songId: string) => Promise<void>;
	search: SongRouteSearch;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	song?: Song;
	songId: string;
}

export function useSongWorkspaceRouting({
	audioFiles,
	getAnnotationsForFile,
	navigate,
	playback,
	ready,
	rememberSongOpened,
	search,
	seekFile,
	song,
	songId,
}: UseSongWorkspaceRoutingOptions) {
	const selectedFileId =
		(search.fileId &&
		audioFiles.some((audioFile) => audioFile.id === search.fileId)
			? search.fileId
			: audioFiles.at(-1)?.id) ?? undefined;
	const selectedFile = audioFiles.find(
		(audioFile) => audioFile.id === selectedFileId,
	);
	const selectedAnnotations = selectedFile
		? getAnnotationsForFile(selectedFile.id)
		: [];
	const activeAnnotationId =
		search.annotationId &&
		selectedAnnotations.some(
			(annotation) => annotation.id === search.annotationId,
		)
			? search.annotationId
			: undefined;
	const activeAnnotation =
		selectedAnnotations.find(
			(annotation) => annotation.id === activeAnnotationId,
		) ?? undefined;

	const appliedSearchRef = useRef("");
	const lastPlaybackPositionRef = useRef<{
		fileId?: string;
		timeMs?: number;
	}>({});
	const rememberedSongIdRef = useRef<string | null>(null);

	const patchRouteSelection = useCallback(
		(options: {
			fileId?: string;
			annotationId?: string;
			clearPlaybackParams?: boolean;
		}) => {
			const { fileId, annotationId, clearPlaybackParams } = options;
			navigate({
				to: "/songs/$songId",
				params: { songId },
				replace: true,
				search: (prev: SongRouteSearch) => {
					const next: SongRouteSearch = { ...prev };

					if (fileId !== undefined) {
						next.fileId = fileId;
					} else {
						delete next.fileId;
					}

					if (annotationId !== undefined) {
						next.annotationId = annotationId;
					} else {
						delete next.annotationId;
					}

					if (clearPlaybackParams) {
						delete next.timeMs;
						next.autoplay = false;
					}

					return next;
				},
			});
		},
		[navigate, songId],
	);

	useEffect(() => {
		if (!ready || !song) {
			return;
		}

		if (rememberedSongIdRef.current === songId) {
			return;
		}

		rememberedSongIdRef.current = songId;
		void rememberSongOpened(songId);
	}, [ready, rememberSongOpened, song, songId]);

	useEffect(() => {
		if (!ready) {
			return;
		}

		if (search.fileId && search.fileId !== selectedFileId) {
			patchRouteSelection({
				fileId: selectedFileId,
			});
			return;
		}

		if (search.annotationId && search.annotationId !== activeAnnotationId) {
			patchRouteSelection({
				fileId: selectedFileId,
				annotationId: activeAnnotationId,
			});
		}
	}, [
		activeAnnotationId,
		patchRouteSelection,
		ready,
		search.annotationId,
		search.fileId,
		selectedFileId,
	]);

	useEffect(() => {
		if (!ready || !song) {
			return;
		}

		const signature = JSON.stringify(search);
		if (appliedSearchRef.current === signature) {
			return;
		}

		appliedSearchRef.current = signature;

		if (!search.fileId || typeof search.timeMs !== "number") {
			return;
		}

		void seekFile(search.fileId, search.timeMs, search.autoplay ?? true);
	}, [ready, search, seekFile, song]);

	useEffect(() => {
		const activeFileId = playback.activeFileId;
		if (!activeFileId) {
			lastPlaybackPositionRef.current = {};
			return;
		}

		const nextTimeMs = playback.currentTimeByFileId[activeFileId];
		if (typeof nextTimeMs !== "number") {
			lastPlaybackPositionRef.current = { fileId: activeFileId };
			return;
		}

		const previous = lastPlaybackPositionRef.current;
		if (
			previous.fileId !== activeFileId ||
			typeof previous.timeMs !== "number"
		) {
			lastPlaybackPositionRef.current = {
				fileId: activeFileId,
				timeMs: nextTimeMs,
			};
			return;
		}

		const crossed = findCrossedAnnotation(
			getAnnotationsForFile(activeFileId),
			previous.timeMs,
			nextTimeMs,
		);
		lastPlaybackPositionRef.current = {
			fileId: activeFileId,
			timeMs: nextTimeMs,
		};

		if (
			!crossed ||
			activeFileId !== selectedFileId ||
			search.annotationId === crossed.id
		) {
			return;
		}

		patchRouteSelection({
			fileId: activeFileId,
			annotationId: crossed.id,
			clearPlaybackParams: true,
		});
	}, [
		getAnnotationsForFile,
		patchRouteSelection,
		playback.activeFileId,
		playback.currentTimeByFileId,
		search.annotationId,
		selectedFileId,
	]);

	const openTarget = useCallback(
		async (target: SongLinkTarget) => {
			if (target.songId !== songId) {
				navigate({
					to: "/songs/$songId",
					params: {
						songId: target.songId,
					},
					search: targetToRouteSearch(target),
				});
				return;
			}

			const nextFileId = target.fileId ?? selectedFileId;
			if (nextFileId && typeof target.timeMs === "number") {
				await seekFile(nextFileId, target.timeMs, target.autoplay ?? true);
			}

			navigate({
				to: "/songs/$songId",
				params: {
					songId,
				},
				search: targetToRouteSearch(target),
			});
		},
		[navigate, seekFile, selectedFileId, songId],
	);

	return {
		activeAnnotation,
		activeAnnotationId,
		openTarget,
		patchRouteSelection,
		selectedAnnotations,
		selectedFile,
		selectedFileId,
	};
}
