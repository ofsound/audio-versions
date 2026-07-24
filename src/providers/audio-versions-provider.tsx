import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { searchAudioVersions } from "#/lib/audio-versions/search";
import type {
	AddAudioFileInput,
	Annotation,
	AudioFileRecord,
	AudioVersionsSnapshot,
	AudioVersionsUiSettings,
	CreateAnnotationInput,
	CreateSongInput,
	SearchResult,
	Song,
	WorkspaceState,
} from "#/lib/audio-versions/types";
import { createCloudPersistence } from "#/lib/cloud/persistence";
import {
	useAnnotationMutations,
	useAudioFileMutations,
	useSongMutations,
	useWorkspaceMutations,
} from "./audio-versions-provider-mutations";
import { useAudioVersionsSelectors } from "./audio-versions-provider-selectors";
import { useAudioVersionsSnapshotState } from "./audio-versions-provider-state";
import { useOptionalAuth } from "./auth-provider";
import {
	type PlaybackState,
	useAudioVersionsPlayback,
} from "./use-audio-versions-playback";

interface AudioVersionsContextValue extends AudioVersionsSnapshot {
	ready: boolean;
	error: string | null;
	playback: PlaybackState;
	search: (query: string) => SearchResult[];
	getSongById: (songId: string) => Song | undefined;
	getAudioFileById: (fileId: string) => AudioFileRecord | undefined;
	getSongAudioFiles: (songId: string) => AudioFileRecord[];
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	getWorkspaceState: (songId: string) => WorkspaceState;
	createSong: (input: CreateSongInput) => Promise<Song>;
	updateSong: (songId: string, patch: Partial<Song>) => Promise<void>;
	deleteSong: (songId: string) => Promise<void>;
	addAudioFile: (
		songId: string,
		input: AddAudioFileInput,
	) => Promise<AudioFileRecord>;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
	deleteAudioFile: (audioFileId: string) => Promise<void>;
	reorderAudioFiles: (songId: string, orderedIds: string[]) => Promise<void>;
	createAnnotation: (input: CreateAnnotationInput) => Promise<Annotation>;
	restoreAnnotation: (annotation: Annotation) => Promise<void>;
	updateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	deleteAnnotation: (annotationId: string) => Promise<void>;
	updateWorkspaceState: (
		songId: string,
		patch:
			| Partial<WorkspaceState>
			| ((current: WorkspaceState) => WorkspaceState),
	) => Promise<void>;
	updateUiSettings: (
		patch:
			| Partial<AudioVersionsUiSettings>
			| ((current: AudioVersionsUiSettings) => AudioVersionsUiSettings),
	) => Promise<void>;
	rememberSongOpened: (songId: string) => Promise<void>;
	registerAudioElement: (
		fileId: string,
		element: HTMLAudioElement | null,
	) => void;
	reportPlaybackState: (
		fileId: string,
		patch: {
			isPlaying?: boolean;
			currentTimeMs?: number;
		},
	) => void;
	togglePlayback: (fileId: string) => Promise<void>;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	seekActiveBy: (deltaMs: number) => Promise<void>;
	jumpBetweenAnnotations: (
		songId: string,
		audioFileId: string,
		direction: "previous" | "next",
	) => Promise<Annotation | null>;
}

const AudioVersionsContext = createContext<AudioVersionsContextValue | null>(
	null,
);

export function AudioVersionsProvider({ children }: { children: ReactNode }) {
	const { cloudAvailable, user } = useOptionalAuth();
	const cloudUserId = cloudAvailable ? user?.id : undefined;
	const cloud = useMemo(
		() => (cloudUserId ? createCloudPersistence(cloudUserId) : null),
		[cloudUserId],
	);
	const { commitSnapshot, error, ready, setError, snapshot, snapshotRef } =
		useAudioVersionsSnapshotState(cloudUserId);
	const selectors = useAudioVersionsSelectors({ snapshot });

	const {
		audioRefs,
		jumpBetweenAnnotations,
		playback,
		registerAudioElement,
		reportPlaybackState,
		seekActiveBy,
		seekFile,
		setPlayback,
		togglePlayback,
	} = useAudioVersionsPlayback({
		getAnnotationsForFile: selectors.getAnnotationsForFile,
		getWorkspaceState: selectors.getWorkspaceState,
		snapshotRef,
	});

	const search = useCallback(
		(query: string) =>
			searchAudioVersions(
				{
					songs: snapshot.songs,
					audioFiles: snapshot.audioFiles,
					annotations: snapshot.annotations,
				},
				query,
				snapshot.settings.ui,
			),
		[
			snapshot.annotations,
			snapshot.audioFiles,
			snapshot.settings.ui,
			snapshot.songs,
		],
	);

	const removeRegisteredAudio = useCallback(
		(audioFileIds: string[]) => {
			for (const fileId of audioFileIds) {
				audioRefs.current.delete(fileId);
			}
		},
		[audioRefs],
	);

	const prunePlaybackState = useCallback(
		(audioFileIds: string[]) => {
			setPlayback((current) => {
				const nextCurrentTimeByFileId = { ...current.currentTimeByFileId };
				let activeDeleted = false;

				for (const fileId of audioFileIds) {
					delete nextCurrentTimeByFileId[fileId];
					if (current.activeFileId === fileId) {
						activeDeleted = true;
					}
				}

				return {
					activeFileId: activeDeleted ? undefined : current.activeFileId,
					isPlaying: activeDeleted ? false : current.isPlaying,
					currentTimeByFileId: nextCurrentTimeByFileId,
				};
			});
		},
		[setPlayback],
	);

	const songMutations = useSongMutations({
		cloud,
		commitSnapshot,
		prunePlaybackState,
		removeRegisteredAudio,
	});
	const audioFileMutations = useAudioFileMutations({
		cloud,
		cloudUserId,
		commitSnapshot,
		prunePlaybackState,
		removeRegisteredAudio,
		setError,
	});
	const annotationMutations = useAnnotationMutations({
		cloud,
		commitSnapshot,
	});
	const workspaceMutations = useWorkspaceMutations({
		cloud,
		commitSnapshot,
	});

	const value = useMemo<AudioVersionsContextValue>(
		() => ({
			...snapshot,
			ready,
			error,
			playback,
			search,
			...selectors,
			...songMutations,
			...audioFileMutations,
			...annotationMutations,
			...workspaceMutations,
			registerAudioElement,
			reportPlaybackState,
			togglePlayback,
			seekFile,
			seekActiveBy,
			jumpBetweenAnnotations,
		}),
		[
			annotationMutations,
			audioFileMutations,
			error,
			jumpBetweenAnnotations,
			playback,
			ready,
			registerAudioElement,
			reportPlaybackState,
			search,
			seekActiveBy,
			seekFile,
			selectors,
			snapshot,
			songMutations,
			togglePlayback,
			workspaceMutations,
		],
	);

	return (
		<AudioVersionsContext.Provider value={value}>
			{children}
		</AudioVersionsContext.Provider>
	);
}

export function useAudioVersions() {
	const context = useContext(AudioVersionsContext);

	if (!context) {
		throw new Error(
			"useAudioVersions must be used inside AudioVersionsProvider.",
		);
	}

	return context;
}
