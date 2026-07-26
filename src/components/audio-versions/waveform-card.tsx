import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/audio-versions/types";
import { normalizeWaveformData } from "#/lib/audio-versions/waveform";
import { useAudioFileLoudness } from "./use-audio-file-loudness";
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
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
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
	onUpdateFile,
	onDragStart,
	onDragEnd,
	onDrop,
}: WaveformCardProps) {
	const objectUrl = useAudioSource(audioFile.id, blob, audioFile.remoteMedia);
	const articleRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
	const rulerSurfaceRef = useRef<HTMLDivElement | null>(null);
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

	const audioEngineGeneration = useWaveformAudioGraph({
		audioRef,
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

		const canvasRect = canvasSurfaceRef.current.getBoundingClientRect();
		if (clientX < canvasRect.left || clientX > canvasRect.right) {
			return false;
		}

		if (!Number.isFinite(clientY)) {
			return true;
		}

		if (clientY >= canvasRect.top && clientY <= canvasRect.bottom) {
			return true;
		}

		const rulerRect = rulerSurfaceRef.current?.getBoundingClientRect();
		if (!rulerRect) {
			return false;
		}

		return clientY >= rulerRect.top && clientY <= rulerRect.bottom;
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

	const { handleDragEnd, handleDragStart, handleDrop } =
		useWaveformCardDragHandle({
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
	const measuringLoudness = useAudioFileLoudness({
		audioFileId: audioFile.id,
		blob,
		loudness: audioFile.loudness,
		onMeasured: (loudness) => onUpdateFile({ loudness }),
	});

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
			<WaveformCardHeader
				audioFileTitle={audioFile.title}
				isPlaying={isPlaying}
				onAddMarkerAtPlayhead={() => {
					void handleAddMarkerAtPlayhead();
				}}
				onCancelPendingRange={handleCancelPendingRange}
				onEndRangeAtPlayhead={() => {
					void handleEndRangeAtPlayhead();
				}}
				onResetPlayhead={() => {
					onSelectFile(audioFile.id);
					void onSeek(0, false);
				}}
				onStartRangeAtPlayhead={handleStartRangeAtPlayhead}
				onTogglePlayback={() => {
					onSelectFile(audioFile.id);
					void onTogglePlayback();
				}}
				pendingRangeStartMs={pendingRangeStartMs}
			/>

			<WaveformCardSurface
				activeAnnotationId={activeAnnotationId}
				annotationOverlayRef={annotationOverlayRef}
				audioFile={audioFile}
				bottomGutterDrag={bottomGutterDrag}
				canvasRef={canvasRef}
				canvasSurfaceRef={canvasSurfaceRef}
				rulerSurfaceRef={rulerSurfaceRef}
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
				loudness={audioFile.loudness}
				measuringLoudness={measuringLoudness}
				onStepVolume={onStepVolume}
				volumeDb={audioFile.volumeDb}
			/>

			<WaveformCardAudio
				key={audioEngineGeneration}
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
