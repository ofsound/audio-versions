import {
	type MutableRefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	closeSharedAudioContext,
	recoverSharedAudioContext,
	resumeSharedAudioContext,
	setAudioElementGain,
	subscribeToAudioEngineGeneration,
} from "#/lib/audio-versions/audio-engine";
import type {
	Annotation,
	AudioVersionsSnapshot,
	WorkspaceState,
} from "#/lib/audio-versions/types";
import { clampTime, volumeDbToGain } from "#/lib/audio-versions/waveform";
import { getRemoteAudioUrl } from "#/lib/cloud/media";

export interface PlaybackState {
	activeFileId?: string;
	isPlaying: boolean;
	currentTimeByFileId: Record<string, number>;
}

interface UseAudioVersionsPlaybackOptions {
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	getWorkspaceState: (songId: string) => WorkspaceState;
	snapshotRef: MutableRefObject<AudioVersionsSnapshot>;
}

export function useAudioVersionsPlayback({
	getAnnotationsForFile,
	getWorkspaceState,
	snapshotRef,
}: UseAudioVersionsPlaybackOptions) {
	const [playback, setPlayback] = useState<PlaybackState>({
		isPlaying: false,
		currentTimeByFileId: {},
	});
	const playbackRef = useRef(playback);
	const audioRefs = useRef(new Map<string, HTMLAudioElement>());
	const pendingCurrentTimeByFileIdRef = useRef<Record<string, number>>({});
	const playbackFrameRef = useRef<number | null>(null);

	useEffect(() => {
		playbackRef.current = playback;
	}, [playback]);

	const cancelScheduledPlaybackUpdate = useCallback(() => {
		if (playbackFrameRef.current === null) {
			return;
		}

		window.cancelAnimationFrame(playbackFrameRef.current);
		playbackFrameRef.current = null;
	}, []);

	const flushPendingPlaybackUpdates = useCallback(() => {
		const pendingEntries = Object.entries(
			pendingCurrentTimeByFileIdRef.current,
		);
		if (pendingEntries.length === 0) {
			cancelScheduledPlaybackUpdate();
			return;
		}

		pendingCurrentTimeByFileIdRef.current = {};
		cancelScheduledPlaybackUpdate();
		setPlayback((current) => ({
			...current,
			currentTimeByFileId: {
				...current.currentTimeByFileId,
				...Object.fromEntries(pendingEntries),
			},
		}));
	}, [cancelScheduledPlaybackUpdate]);

	const schedulePlaybackTimeUpdate = useCallback(
		(fileId: string, currentTimeMs: number) => {
			pendingCurrentTimeByFileIdRef.current[fileId] = currentTimeMs;
			if (playbackFrameRef.current !== null) {
				return;
			}

			playbackFrameRef.current = window.requestAnimationFrame(() => {
				flushPendingPlaybackUpdates();
			});
		},
		[flushPendingPlaybackUpdates],
	);

	useEffect(
		() => () => {
			pendingCurrentTimeByFileIdRef.current = {};
			cancelScheduledPlaybackUpdate();
			void closeSharedAudioContext();
		},
		[cancelScheduledPlaybackUpdate],
	);

	useEffect(() => {
		const handleForeground = () => {
			if (document.visibilityState === "visible") {
				void recoverSharedAudioContext();
			}
		};
		const handlePageHide = (event: PageTransitionEvent) => {
			if (!event.persisted) {
				void closeSharedAudioContext();
			}
		};

		document.addEventListener("visibilitychange", handleForeground);
		window.addEventListener("pageshow", handleForeground);
		window.addEventListener("pagehide", handlePageHide);

		return () => {
			document.removeEventListener("visibilitychange", handleForeground);
			window.removeEventListener("pageshow", handleForeground);
			window.removeEventListener("pagehide", handlePageHide);
		};
	}, []);

	const pauseOtherAudio = useCallback((currentFileId?: string) => {
		for (const [fileId, element] of audioRefs.current.entries()) {
			if (fileId !== currentFileId && !element.paused) {
				element.pause();
			}
		}
	}, []);

	useEffect(
		() =>
			subscribeToAudioEngineGeneration(() => {
				pauseOtherAudio();
				setPlayback((current) => ({
					...current,
					isPlaying: false,
				}));
			}),
		[pauseOtherAudio],
	);

	const refreshAudioSource = useCallback(
		async (fileId: string, element: HTMLAudioElement, force = false) => {
			const audioFile = snapshotRef.current.audioFiles.find(
				(entry) => entry.id === fileId,
			);
			if (!audioFile?.remoteMedia || element.src.startsWith("blob:")) {
				return;
			}

			const url = await getRemoteAudioUrl(fileId, force);
			if (url !== element.src || element.error) {
				const currentTime = element.currentTime;
				element.src = url;
				element.load();
				// Before metadata loads, this sets the default playback start position.
				element.currentTime = currentTime;
			}
		},
		[snapshotRef],
	);

	const playAudioElement = useCallback(
		async (fileId: string, element: HTMLAudioElement) => {
			// Prepare and resume only during playback, avoiding native device probing on open.
			const file = snapshotRef.current.audioFiles.find(
				(entry) => entry.id === fileId,
			);
			setAudioElementGain(element, volumeDbToGain(file?.volumeDb ?? 0));
			// Resume during the user gesture even if a fresh private URL needs a request.
			const resumePromise = resumeSharedAudioContext();
			const playPromise = (async () => {
				const isRemote =
					!element.src.startsWith("blob:") &&
					snapshotRef.current.audioFiles.some(
						(entry) => entry.id === fileId && entry.remoteMedia,
					);
				if (isRemote) {
					await refreshAudioSource(fileId, element);
				}
				try {
					if (audioRefs.current.get(fileId) !== element) return;
					await element.play();
				} catch (error) {
					if (!isRemote || !element.error) throw error;
					await refreshAudioSource(fileId, element, true);
					if (audioRefs.current.get(fileId) !== element) return;
					await element.play();
				}
			})();
			const [resumeResult, playResult] = await Promise.allSettled([
				resumePromise,
				playPromise,
			]);
			const resumed =
				resumeResult.status === "fulfilled" && resumeResult.value === true;
			const played = playResult.status === "fulfilled";

			if (!resumed || !played || audioRefs.current.get(fileId) !== element) {
				if (!element.paused) {
					element.pause();
				}
				return false;
			}

			return true;
		},
		[refreshAudioSource, snapshotRef],
	);

	const registerAudioElement = useCallback(
		(fileId: string, element: HTMLAudioElement | null) => {
			if (element) {
				audioRefs.current.set(fileId, element);
			} else {
				audioRefs.current.delete(fileId);
			}
		},
		[],
	);

	const reportPlaybackState = useCallback(
		(
			fileId: string,
			patch: {
				isPlaying?: boolean;
				currentTimeMs?: number;
			},
		) => {
			if (typeof patch.isPlaying !== "boolean") {
				if (typeof patch.currentTimeMs === "number") {
					schedulePlaybackTimeUpdate(fileId, patch.currentTimeMs);
				}
				return;
			}

			const isPlaying = patch.isPlaying;
			flushPendingPlaybackUpdates();
			setPlayback((current) => ({
				activeFileId:
					isPlaying || current.activeFileId === fileId
						? fileId
						: current.activeFileId,
				isPlaying,
				currentTimeByFileId:
					typeof patch.currentTimeMs === "number"
						? {
								...current.currentTimeByFileId,
								[fileId]: patch.currentTimeMs,
							}
						: current.currentTimeByFileId,
			}));
		},
		[flushPendingPlaybackUpdates, schedulePlaybackTimeUpdate],
	);

	const seekFile = useCallback(
		async (fileId: string, timeMs: number, autoplay = false) => {
			const element = audioRefs.current.get(fileId);
			const audioFile = snapshotRef.current.audioFiles.find(
				(entry) => entry.id === fileId,
			);
			if (!element || !audioFile) {
				return;
			}

			try {
				await refreshAudioSource(fileId, element);
			} catch {
				return;
			}
			const boundedTime = clampTime(timeMs, audioFile.durationMs);
			element.currentTime = boundedTime / 1000;
			reportPlaybackState(fileId, {
				currentTimeMs: boundedTime,
			});

			if (autoplay) {
				pauseOtherAudio(fileId);
				if (!(await playAudioElement(fileId, element))) {
					return;
				}
				reportPlaybackState(fileId, {
					isPlaying: true,
					currentTimeMs: boundedTime,
				});
			}
		},
		[
			pauseOtherAudio,
			playAudioElement,
			refreshAudioSource,
			reportPlaybackState,
			snapshotRef,
		],
	);

	const togglePlayback = useCallback(
		async (fileId: string) => {
			const element = audioRefs.current.get(fileId);
			if (!element) {
				return;
			}

			if (!element.paused) {
				element.pause();
				reportPlaybackState(fileId, {
					isPlaying: false,
					currentTimeMs: element.currentTime * 1000,
				});
				return;
			}

			pauseOtherAudio(fileId);
			if (!(await playAudioElement(fileId, element))) {
				return;
			}
			reportPlaybackState(fileId, {
				isPlaying: true,
				currentTimeMs: element.currentTime * 1000,
			});
		},
		[pauseOtherAudio, playAudioElement, reportPlaybackState],
	);

	const seekActiveBy = useCallback(
		async (deltaMs: number) => {
			const activeFileId = playbackRef.current.activeFileId;
			if (!activeFileId) {
				return;
			}

			const currentTime =
				playbackRef.current.currentTimeByFileId[activeFileId] ?? 0;
			await seekFile(
				activeFileId,
				currentTime + deltaMs,
				playbackRef.current.isPlaying,
			);
		},
		[seekFile],
	);

	const jumpBetweenAnnotations = useCallback(
		async (
			songId: string,
			audioFileId: string,
			direction: "previous" | "next",
		) => {
			const annotations = getAnnotationsForFile(audioFileId);
			if (!annotations.length) {
				return null;
			}

			const workspace = getWorkspaceState(songId);
			const currentTime =
				playbackRef.current.currentTimeByFileId[audioFileId] ??
				workspace.playheadMsByFileId[audioFileId] ??
				0;

			let target: Annotation | undefined;
			if (direction === "next") {
				target = annotations.find(
					(annotation) => annotation.startMs > currentTime + 200,
				);
				target ??= annotations[0];
			} else {
				target = [...annotations]
					.reverse()
					.find((annotation) => annotation.startMs < currentTime - 200);
				target ??= annotations.at(-1);
			}

			if (!target) {
				return null;
			}

			await seekFile(audioFileId, target.startMs, true);
			return target;
		},
		[getAnnotationsForFile, getWorkspaceState, seekFile],
	);

	return {
		audioRefs,
		jumpBetweenAnnotations,
		playback,
		playbackRef,
		registerAudioElement,
		reportPlaybackState,
		seekActiveBy,
		seekFile,
		setPlayback,
		togglePlayback,
	};
}
