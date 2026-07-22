import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { resolveAudioFileSessionDateLabel } from "#/lib/version-compare/dates";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/version-compare/types";
import { normalizeWaveformData } from "#/lib/version-compare/waveform";
import { useAudioSource } from "./use-audio-source";
import { useWaveformAudioGraph } from "./use-waveform-audio-graph";
import { useWaveformCanvas } from "./use-waveform-canvas";
import { useWaveformCardAnnotations } from "./use-waveform-card-annotations";
import { useWaveformCardDragHandle } from "./use-waveform-card-drag-handle";
import { useWaveformCardPreview } from "./use-waveform-card-preview";
import { useWaveformGutterQuickAdd } from "./use-waveform-gutter-quick-add";
import { useWaveformRangeDrag } from "./use-waveform-range-drag";
import { useWaveformSeekDrag } from "./use-waveform-seek-drag";
import { WaveformCardAudio } from "./waveform-card-audio";
import { WaveformCardFooter } from "./waveform-card-footer";
import { WaveformCardHeader } from "./waveform-card-header";
import {
	getPlayheadClientX as getPlayheadClientXFromBounds,
	getTimePerPixel as getTimePerPixelFromBounds,
	getWaveformTimeMs as getWaveformTimeMsFromBounds,
} from "./waveform-card-math";
import { shouldIgnoreWaveformCardSelection } from "./waveform-card-selection";
import { WaveformCardSurface } from "./waveform-card-surface";

const PLAYHEAD_SNAP_DISTANCE_PX = 20;

interface WaveformCardProps {
	audioFile: AudioFileRecord;
	annotations: Annotation[];
	blob?: Blob;
	currentTimeMs: number;
	isPlaying: boolean;
	isSelected: boolean;
	activeAnnotationId?: string;
	onSelectFile: (fileId: string) => void;
	onSelectAnnotation: (annotationId: string) => void;
	onCreateAnnotation: (
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onTogglePlayback: () => Promise<void>;
	onRegisterAudioElement: (element: HTMLAudioElement | null) => void;
	onReportPlayback: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
	onStepVolume: (deltaDb: number) => Promise<void>;
	onOpenFileDetails: (fileId: string) => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDrop: () => void;
}

export function WaveformCard({
	audioFile,
	annotations,
	blob,
	currentTimeMs,
	isPlaying,
	isSelected,
	activeAnnotationId,
	onSelectFile,
	onSelectAnnotation,
	onCreateAnnotation,
	onUpdateAnnotation,
	onDeleteAnnotation,
	onSeek,
	onTogglePlayback,
	onRegisterAudioElement,
	onReportPlayback,
	onStepVolume,
	onOpenFileDetails,
	onDragStart,
	onDragEnd,
	onDrop,
}: WaveformCardProps) {
	const objectUrl = useAudioSource(audioFile.id, blob, audioFile.remoteMedia);
	const articleRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
	const annotationOverlayRef = useRef<HTMLDivElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const waveform = useMemo(
		() => normalizeWaveformData(audioFile.waveform, audioFile.durationMs),
		[audioFile.durationMs, audioFile.waveform],
	);
	const {
		clearHoveredAnnotation,
		commitAnnotationChange,
		hoveredAnnotationRecord,
		hoveredTooltipPosition,
		previewAnnotationChange,
		resetAnnotationPreview,
		setHoveredAnnotation,
		sortedAnnotations,
		updateHoveredAnnotationPosition,
	} = useWaveformCardPreview({
		annotationOverlayRef,
		annotations,
		onUpdateAnnotation,
	});
	const {
		createPointAnnotationAtTime,
		createRangeAnnotationAtTime,
		createRangeAnnotationFromBounds,
		handleAddMarkerAtPlayhead,
		handleCancelPendingRange,
		handleEndRangeAtPlayhead,
		handleStartRangeAtPlayhead,
		pendingRangeStartMs,
	} = useWaveformCardAnnotations({
		audioFile,
		currentTimeMs,
		onCreateAnnotation,
		onSelectAnnotation,
		onSelectFile,
	});

	useEffect(() => {
		if (!audioRef.current) {
			return;
		}

		const nextTime = Math.max(0, currentTimeMs / 1000);
		if (
			audioRef.current.paused &&
			Math.abs(audioRef.current.currentTime - nextTime) > 0.3
		) {
			audioRef.current.currentTime = nextTime;
		}
	}, [currentTimeMs]);

	useWaveformAudioGraph({
		audioRef,
		isPlaying,
		volumeDb: audioFile.volumeDb,
	});

	useWaveformCanvas({
		canvasRef,
		currentTimeMs,
		isSelected,
		surfaceRef: canvasSurfaceRef,
		waveform,
	});

	function isClientXYInCanvasSurface(
		clientX: number,
		clientY: number,
	): boolean {
		if (!canvasSurfaceRef.current) {
			return false;
		}

		const rect = canvasSurfaceRef.current.getBoundingClientRect();
		if (clientX < rect.left || clientX > rect.right) {
			return false;
		}

		if (!Number.isFinite(clientY)) {
			return true;
		}

		return clientY >= rect.top && clientY <= rect.bottom;
	}

	function getWaveformTimeMs(clientX: number): number | null {
		if (!canvasSurfaceRef.current) {
			return null;
		}

		return getWaveformTimeMsFromBounds(
			canvasSurfaceRef.current.getBoundingClientRect(),
			clientX,
			audioFile.durationMs,
		);
	}

	function getPlayheadClientX(): number | null {
		if (isPlaying || !canvasSurfaceRef.current) {
			return null;
		}

		return getPlayheadClientXFromBounds(
			canvasSurfaceRef.current.getBoundingClientRect(),
			currentTimeMs,
			audioFile.durationMs,
		);
	}

	function snapClientXToPlayhead(clientX: number): number {
		const playheadClientX = getPlayheadClientX();
		if (
			playheadClientX !== null &&
			Math.abs(clientX - playheadClientX) <= PLAYHEAD_SNAP_DISTANCE_PX
		) {
			return playheadClientX;
		}
		return clientX;
	}

	function getTimePerPixel(): number {
		if (!canvasSurfaceRef.current) {
			return 0;
		}

		return getTimePerPixelFromBounds(
			canvasSurfaceRef.current.getBoundingClientRect(),
			audioFile.durationMs,
		);
	}

	const {
		handleArmDrag,
		handleDragEnd,
		handleDragStart,
		handleDrop,
		handleReleaseDrag,
	} = useWaveformCardDragHandle({
		articleRef,
		audioFileId: audioFile.id,
		onDragEnd,
		onDragStart,
		onDrop,
		onSelectFile,
	});
	const {
		clearGutterHover,
		gutterHover,
		handleTopGutterClick,
		updateGutterHoverFromEvent,
	} = useWaveformGutterQuickAdd({
		audioFileId: audioFile.id,
		createPointAnnotationAtTime,
		getWaveformTimeMs,
		onSelectFile,
		snapClientXToPlayhead,
	});
	const updateBottomGutterHover = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			updateGutterHoverFromEvent("bottom", event);
		},
		[updateGutterHoverFromEvent],
	);
	const {
		bottomGutterDrag,
		handleBottomGutterPointerCancel,
		handleBottomGutterPointerDown,
		handleBottomGutterPointerMove,
		handleBottomGutterPointerUp,
	} = useWaveformRangeDrag({
		audioFileId: audioFile.id,
		createRangeAnnotationAtTime,
		createRangeAnnotationFromBounds,
		getWaveformTimeMs,
		onSelectFile,
		snapClientXToPlayhead,
		updateBottomGutterHover,
	});
	const {
		handleSurfaceDoubleClick,
		handleSurfaceKeyDown,
		handleSurfacePointerCancel,
		handleSurfacePointerDown,
		handleSurfacePointerMove,
		handleSurfacePointerUp,
	} = useWaveformSeekDrag({
		audioFileId: audioFile.id,
		audioRef,
		durationMs: audioFile.durationMs,
		getWaveformTimeMs,
		isClientXYInCanvasSurface,
		onReportPlayback,
		onSeek,
		onSelectFile,
	});
	const sessionDateLabel = resolveAudioFileSessionDateLabel(audioFile);

	return (
		<article
			ref={articleRef}
			draggable={false}
			onPointerDown={(event) => {
				if (shouldIgnoreWaveformCardSelection(event.target)) {
					return;
				}

				onSelectFile(audioFile.id);
			}}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragOver={(event) => event.preventDefault()}
			onDrop={handleDrop}
			className={`waveform-card ${isSelected ? "waveform-card--selected" : ""}`}
		>
			<span className="waveform-card__tab" aria-hidden="true" />
			<WaveformCardHeader
				audioFileTitle={audioFile.title}
				isPlaying={isPlaying}
				onAddMarkerAtPlayhead={() => {
					void handleAddMarkerAtPlayhead();
				}}
				onArmDrag={handleArmDrag}
				onCancelPendingRange={handleCancelPendingRange}
				onEndRangeAtPlayhead={() => {
					void handleEndRangeAtPlayhead();
				}}
				onOpenFileDetails={() => onOpenFileDetails(audioFile.id)}
				onReleaseDrag={handleReleaseDrag}
				onResetPlayhead={() => {
					onSelectFile(audioFile.id);
					void onSeek(0, false);
				}}
				onSelectFile={() => onSelectFile(audioFile.id)}
				onStartRangeAtPlayhead={handleStartRangeAtPlayhead}
				onTogglePlayback={() => {
					onSelectFile(audioFile.id);
					void onTogglePlayback();
				}}
				pendingRangeStartMs={pendingRangeStartMs}
				sessionDateLabel={sessionDateLabel}
			/>

			<WaveformCardSurface
				activeAnnotationId={activeAnnotationId}
				annotationOverlayRef={annotationOverlayRef}
				audioFile={audioFile}
				bottomGutterDrag={bottomGutterDrag}
				canvasRef={canvasRef}
				canvasSurfaceRef={canvasSurfaceRef}
				clearGutterHover={clearGutterHover}
				clearHoveredAnnotation={clearHoveredAnnotation}
				commitAnnotationChange={commitAnnotationChange}
				getTimePerPixel={getTimePerPixel}
				gutterHover={gutterHover}
				handleBottomGutterPointerCancel={handleBottomGutterPointerCancel}
				handleBottomGutterPointerDown={handleBottomGutterPointerDown}
				handleBottomGutterPointerMove={handleBottomGutterPointerMove}
				handleBottomGutterPointerUp={handleBottomGutterPointerUp}
				handleSurfaceDoubleClick={handleSurfaceDoubleClick}
				handleSurfaceKeyDown={handleSurfaceKeyDown}
				handleSurfacePointerCancel={handleSurfacePointerCancel}
				handleSurfacePointerDown={handleSurfacePointerDown}
				handleSurfacePointerMove={handleSurfacePointerMove}
				handleSurfacePointerUp={handleSurfacePointerUp}
				handleTopGutterClick={handleTopGutterClick}
				hoveredAnnotationRecord={hoveredAnnotationRecord}
				hoveredTooltipPosition={hoveredTooltipPosition}
				onDeleteAnnotation={onDeleteAnnotation}
				onSeek={onSeek}
				onSelectAnnotation={onSelectAnnotation}
				onSelectFile={onSelectFile}
				previewAnnotationChange={previewAnnotationChange}
				resetAnnotationPreview={resetAnnotationPreview}
				setHoveredAnnotation={setHoveredAnnotation}
				sortedAnnotations={sortedAnnotations}
				updateBottomGutterHover={updateBottomGutterHover}
				updateGutterHoverFromEvent={updateGutterHoverFromEvent}
				updateHoveredAnnotationPosition={updateHoveredAnnotationPosition}
			/>

			<WaveformCardFooter
				audioFileTitle={audioFile.title}
				currentTimeMs={currentTimeMs}
				durationMs={audioFile.durationMs}
				onStepVolume={onStepVolume}
				volumeDb={audioFile.volumeDb}
			/>

			<WaveformCardAudio
				audioFileDurationMs={audioFile.durationMs}
				audioRef={audioRef}
				currentTimeMs={currentTimeMs}
				objectUrl={objectUrl}
				onRegisterAudioElement={onRegisterAudioElement}
				onReportPlayback={onReportPlayback}
			/>
		</article>
	);
}
