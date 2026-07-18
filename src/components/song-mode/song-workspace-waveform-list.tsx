import { useEffect, useRef, useState } from "react";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
	WaveformLayout,
} from "#/lib/song-mode/types";
import { normalizeVolumeDb } from "#/lib/song-mode/waveform";
import type { PlaybackState } from "#/providers/use-song-mode-playback";
import { reorderAudioFileIds } from "./reorder-audio-file-ids";
import { WaveformCard } from "./waveform-card";
import { WaveformThumbnail } from "./waveform-thumbnail";

interface SongWorkspaceWaveformListProps {
	activeAnnotationId?: string;
	audioFiles: AudioFileRecord[];
	blobsByAudioId: Record<string, Blob>;
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	handleCreateAnnotation: (
		fileId: string,
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	playback: PlaybackState;
	registerAudioElement: (
		fileId: string,
		element: HTMLAudioElement | null,
	) => void;
	reorderAudioFiles: (songId: string, orderedIds: string[]) => Promise<void>;
	reportPlaybackState: (
		fileId: string,
		patch: {
			isPlaying?: boolean;
			currentTimeMs?: number;
		},
	) => void;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	selectedFileId?: string;
	songId: string;
	togglePlayback: (fileId: string) => Promise<void>;
	updateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	deleteAnnotation: (annotationId: string) => Promise<void>;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
	workspacePlayheadMsByFileId: Record<string, number>;
	waveformLayout: WaveformLayout;
	onOpenFileDetails: (fileId: string) => void;
	onSelectFile: (fileId: string) => void;
	onSelectAnnotation: (fileId: string, annotationId: string) => void;
}

export function SongWorkspaceWaveformList({
	activeAnnotationId,
	audioFiles,
	blobsByAudioId,
	getAnnotationsForFile,
	handleCreateAnnotation,
	playback,
	registerAudioElement,
	reorderAudioFiles,
	reportPlaybackState,
	seekFile,
	selectedFileId,
	songId,
	togglePlayback,
	updateAnnotation,
	deleteAnnotation,
	updateAudioFile,
	workspacePlayheadMsByFileId,
	waveformLayout,
	onOpenFileDetails,
	onSelectAnnotation,
	onSelectFile,
}: SongWorkspaceWaveformListProps) {
	const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
	const [isPhoneViewport, setIsPhoneViewport] = useState(false);
	const thumbnailsViewportRef = useRef<HTMLDivElement | null>(null);
	const orderedIdsRef = useRef<string[]>([]);
	orderedIdsRef.current = audioFiles.map((audioFile) => audioFile.id);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const updatePhoneViewport = () => setIsPhoneViewport(mediaQuery.matches);
		updatePhoneViewport();
		mediaQuery.addEventListener("change", updatePhoneViewport);

		return () => mediaQuery.removeEventListener("change", updatePhoneViewport);
	}, []);

	useEffect(() => {
		if (
			waveformLayout !== "browser" ||
			audioFiles.length === 0 ||
			!thumbnailsViewportRef.current
		) {
			return;
		}

		thumbnailsViewportRef.current.scrollTop =
			thumbnailsViewportRef.current.scrollHeight;
	}, [audioFiles.length, waveformLayout]);

	if (audioFiles.length === 0) {
		return (
			<div className="border border-dashed border-[var(--color-border-plain)] px-6 py-10 text-sm leading-7 text-[var(--color-text-muted)]">
				Add audio to start the stacked waveform review. Each file gets its own
				notes, time markers, range annotations, and immediate seek-and-play
				links.
			</div>
		);
	}

	const renderWaveformCard = (audioFile: AudioFileRecord) => (
		<div key={audioFile.id}>
			<WaveformCard
				audioFile={audioFile}
				annotations={getAnnotationsForFile(audioFile.id)}
				blob={blobsByAudioId[audioFile.id]}
				currentTimeMs={
					playback.currentTimeByFileId[audioFile.id] ??
					workspacePlayheadMsByFileId[audioFile.id] ??
					0
				}
				isPlaying={playback.activeFileId === audioFile.id && playback.isPlaying}
				isSelected={selectedFileId === audioFile.id}
				activeAnnotationId={activeAnnotationId}
				onSelectFile={onSelectFile}
				onSelectAnnotation={(annotationId) =>
					onSelectAnnotation(audioFile.id, annotationId)
				}
				onCreateAnnotation={(annotationInput) =>
					handleCreateAnnotation(audioFile.id, annotationInput)
				}
				onUpdateAnnotation={updateAnnotation}
				onDeleteAnnotation={deleteAnnotation}
				onSeek={(timeMs, autoplay) => seekFile(audioFile.id, timeMs, autoplay)}
				onTogglePlayback={() => togglePlayback(audioFile.id)}
				onRegisterAudioElement={(element) =>
					registerAudioElement(audioFile.id, element)
				}
				onReportPlayback={(patch) => reportPlaybackState(audioFile.id, patch)}
				onStepVolume={(deltaDb) =>
					updateAudioFile(audioFile.id, {
						volumeDb: normalizeVolumeDb(audioFile.volumeDb + deltaDb),
					})
				}
				onOpenFileDetails={onOpenFileDetails}
				onDragStart={() => setDraggingFileId(audioFile.id)}
				onDragEnd={() => setDraggingFileId(null)}
				onDrop={() => {
					if (!draggingFileId) {
						return;
					}

					const orderedIds = reorderAudioFileIds(
						orderedIdsRef.current,
						draggingFileId,
						audioFile.id,
					);
					setDraggingFileId(null);
					if (!orderedIds) {
						return;
					}

					void reorderAudioFiles(songId, orderedIds);
				}}
			/>
		</div>
	);

	if (waveformLayout === "browser" || isPhoneViewport) {
		const selectedAudioFile = audioFiles.find(
			(audioFile) => audioFile.id === selectedFileId,
		);

		return (
			<div className="song-workspace-file-browser flex min-h-0 flex-1 flex-col gap-4 xl:h-full">
				<div
					ref={thumbnailsViewportRef}
					className="song-workspace-file-browser__list min-h-[9rem] flex-1 overflow-y-auto xl:min-h-0"
				>
					<div className="grid grid-cols-2 gap-3 sm:gap-4">
						{audioFiles.map((audioFile) => (
							<div key={audioFile.id}>
								<WaveformThumbnail
									audioFile={audioFile}
									currentTimeMs={
										playback.currentTimeByFileId[audioFile.id] ??
										workspacePlayheadMsByFileId[audioFile.id] ??
										0
									}
									isSelected={selectedFileId === audioFile.id}
									onSelectFile={onSelectFile}
								/>
							</div>
						))}
					</div>
				</div>
				<div
					className="song-workspace-file-player min-h-0 shrink-0 overflow-y-auto"
					data-testid={isPhoneViewport ? "mobile-file-player" : undefined}
				>
					{selectedAudioFile ? (
						renderWaveformCard(selectedAudioFile)
					) : (
						<div className="border border-dashed border-[var(--color-border-plain)] px-5 py-6 text-sm text-[var(--color-text-muted)]">
							Select a file above to open its player.
						</div>
					)}
				</div>
			</div>
		);
	}

	return <>{audioFiles.map((audioFile) => renderWaveformCard(audioFile))}</>;
}
