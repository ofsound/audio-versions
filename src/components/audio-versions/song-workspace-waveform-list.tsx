import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/audio-versions/types";
import { getWaveformHeightPx } from "#/lib/audio-versions/ui-settings";
import { normalizeVolumeDb } from "#/lib/audio-versions/waveform";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import type { PlaybackState } from "#/providers/use-audio-versions-playback";
import { reorderAudioFileIds } from "./reorder-audio-file-ids";
import { WaveformCard } from "./waveform-card";
import { WaveformThumbnail } from "./waveform-thumbnail";
import {
	calculateWaveformThumbnailGridLayout,
	getWaveformThumbnailGridContentHeight,
} from "./waveform-thumbnail-grid-layout";

const VERSION_TRAY_CHROME_HEIGHT_PX = 26;
const VERSION_TRAY_ACTION_HEIGHT_PX = 48;

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
	deletingFileId: string | null;
	onDeleteFile: (fileId: string) => void;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
	workspacePlayheadMsByFileId: Record<string, number>;
	onSelectFile: (fileId: string) => void;
	onSelectAnnotation: (fileId: string, annotationId: string) => void;
	onOpenUpload: () => void;
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
	deletingFileId,
	onDeleteFile,
	updateAudioFile,
	workspacePlayheadMsByFileId,
	onSelectAnnotation,
	onSelectFile,
	onOpenUpload,
}: SongWorkspaceWaveformListProps) {
	const { settings } = useAudioVersions();
	const hasAudioFiles = audioFiles.length > 0;
	const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
	const [isPhoneViewport, setIsPhoneViewport] = useState(false);
	const [isFitGridViewport, setIsFitGridViewport] = useState(false);
	const [thumbnailsViewportSize, setThumbnailsViewportSize] = useState({
		height: 0,
		width: 0,
	});
	const thumbnailsViewportRef = useRef<HTMLDivElement | null>(null);
	const orderedIdsRef = useRef<string[]>([]);
	orderedIdsRef.current = audioFiles.map((audioFile) => audioFile.id);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const fitGridMediaQuery = window.matchMedia("(min-width: 1280px)");
		const updatePhoneViewport = () => setIsPhoneViewport(mediaQuery.matches);
		const updateFitGridViewport = () =>
			setIsFitGridViewport(fitGridMediaQuery.matches);
		updatePhoneViewport();
		updateFitGridViewport();
		mediaQuery.addEventListener("change", updatePhoneViewport);
		fitGridMediaQuery.addEventListener("change", updateFitGridViewport);

		return () => {
			mediaQuery.removeEventListener("change", updatePhoneViewport);
			fitGridMediaQuery.removeEventListener("change", updateFitGridViewport);
		};
	}, []);

	useEffect(() => {
		if (!hasAudioFiles) {
			return;
		}

		const viewport = thumbnailsViewportRef.current;
		if (!viewport) {
			return;
		}

		const updateViewportSize = () => {
			const nextSize = {
				height: Math.max(
					0,
					viewport.clientHeight -
						(isFitGridViewport
							? VERSION_TRAY_CHROME_HEIGHT_PX + VERSION_TRAY_ACTION_HEIGHT_PX
							: 0),
				),
				width: Math.max(
					0,
					viewport.clientWidth -
						(isFitGridViewport ? VERSION_TRAY_CHROME_HEIGHT_PX : 0),
				),
			};
			setThumbnailsViewportSize((currentSize) =>
				currentSize.height === nextSize.height &&
				currentSize.width === nextSize.width
					? currentSize
					: nextSize,
			);
		};
		updateViewportSize();

		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(updateViewportSize);
		observer?.observe(viewport);
		window.addEventListener("resize", updateViewportSize);

		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", updateViewportSize);
		};
	}, [hasAudioFiles, isFitGridViewport]);

	useEffect(() => {
		if (audioFiles.length === 0 || !thumbnailsViewportRef.current) {
			return;
		}

		thumbnailsViewportRef.current.scrollTop = 0;
	}, [audioFiles.length]);

	const thumbnailGridLayout = isFitGridViewport
		? calculateWaveformThumbnailGridLayout({
				height: thumbnailsViewportSize.height,
				itemCount: audioFiles.length,
				maxRowHeightPx: getWaveformHeightPx(settings.ui.waveformHeight),
				width: thumbnailsViewportSize.width,
			})
		: null;
	const versionTrayHeight = thumbnailGridLayout
		? getWaveformThumbnailGridContentHeight(thumbnailGridLayout) +
			VERSION_TRAY_CHROME_HEIGHT_PX +
			VERSION_TRAY_ACTION_HEIGHT_PX
		: undefined;

	if (!hasAudioFiles) {
		return (
			<div className="song-workspace-version-tray flex min-h-[9rem] flex-col gap-3 p-3">
				<div className="flex flex-1 items-center border border-dashed border-[var(--color-border-plain)] px-6 py-10 text-sm leading-7 text-[var(--color-text-muted)]">
					Add audio to start reviewing waveforms. Each file gets its own notes,
					time markers, range annotations, and immediate seek-and-play links.
				</div>
				<AddFileButton onClick={onOpenUpload} />
			</div>
		);
	}

	const selectedAudioFile = audioFiles.find(
		(audioFile) => audioFile.id === selectedFileId,
	);

	const renderWaveformCard = (audioFile: AudioFileRecord) => (
		<div className="min-w-0" key={audioFile.id}>
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
				onUpdateFile={(patch) => updateAudioFile(audioFile.id, patch)}
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

	return (
		<div className="song-workspace-file-browser flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:h-full">
			<div
				className="song-workspace-file-player min-h-0 min-w-0 shrink-0 overflow-x-hidden overflow-y-auto"
				data-testid={isPhoneViewport ? "mobile-file-player" : undefined}
			>
				{selectedAudioFile ? (
					renderWaveformCard(selectedAudioFile)
				) : (
					<div className="border border-dashed border-[var(--color-border-plain)] px-5 py-6 text-sm text-[var(--color-text-muted)]">
						Select a file below to open its player.
					</div>
				)}
			</div>
			<div
				ref={thumbnailsViewportRef}
				className="flex min-h-[9rem] flex-1 items-end xl:min-h-0"
			>
				<div
					className="song-workspace-version-tray flex h-full w-full flex-col gap-3 p-3"
					style={versionTrayHeight ? { height: versionTrayHeight } : undefined}
				>
					<div className="song-workspace-file-browser__list min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
						<div
							className="waveform-thumbnail-grid grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3"
							data-density={thumbnailGridLayout?.density}
							style={
								thumbnailGridLayout
									? {
											gap: `${thumbnailGridLayout.gapPx}px`,
											gridAutoRows: `${thumbnailGridLayout.rowHeightPx}px`,
											gridTemplateColumns: `repeat(${thumbnailGridLayout.columns}, minmax(0, 1fr))`,
										}
									: undefined
							}
						>
							{[...audioFiles].reverse().map((audioFile) => (
								<div className="min-h-0" key={audioFile.id}>
									<WaveformThumbnail
										audioFile={audioFile}
										blob={blobsByAudioId[audioFile.id]}
										currentTimeMs={
											playback.currentTimeByFileId[audioFile.id] ??
											workspacePlayheadMsByFileId[audioFile.id] ??
											0
										}
										isSelected={selectedFileId === audioFile.id}
										deletingFile={deletingFileId === audioFile.id}
										onDeleteFile={onDeleteFile}
										onSelectFile={onSelectFile}
									/>
								</div>
							))}
						</div>
					</div>
					<AddFileButton onClick={onOpenUpload} />
				</div>
			</div>
		</div>
	);
}

function AddFileButton({ onClick }: { onClick: () => void }) {
	return (
		<div className="flex shrink-0 justify-end">
			<button
				type="button"
				onClick={onClick}
				className="song-workspace-add-file action-primary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 px-3 text-xs font-semibold leading-none"
			>
				<Upload size={16} />
				Add file
			</button>
		</div>
	);
}
