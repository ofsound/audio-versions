import { Plus } from "lucide-react";
import type {
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import type { Annotation, AudioFileRecord } from "#/lib/audio-versions/types";
import { WaveformCardAnnotationLayer } from "./waveform-card-annotation-layer";
import { WaveformRuler } from "./waveform-ruler";

interface GutterHoverState {
	position: "top" | "bottom";
	x: number;
	timeMs: number;
}

interface BottomGutterDragState {
	pointerId: number;
	anchorTimeMs: number;
	currentTimeMs: number;
	moved: boolean;
}

interface WaveformCardSurfaceProps {
	activeAnnotationId?: string;
	annotationOverlayRef: RefObject<HTMLDivElement | null>;
	audioFile: AudioFileRecord;
	bottomGutterDrag: BottomGutterDragState | null;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	canvasSurfaceRef: RefObject<HTMLDivElement | null>;
	rulerSurfaceRef: RefObject<HTMLDivElement | null>;
	clearGutterHover: () => void;
	clearHoveredAnnotation: () => void;
	commitAnnotationChange: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	getTimePerPixel: () => number;
	gutterHover: GutterHoverState | null;
	handleBottomGutterPointerCancel: (
		event: ReactPointerEvent<HTMLDivElement>,
	) => void;
	handleBottomGutterPointerDown: (
		event: ReactPointerEvent<HTMLDivElement>,
	) => void;
	handleBottomGutterPointerMove: (
		event: ReactPointerEvent<HTMLDivElement>,
	) => void;
	handleBottomGutterPointerUp: (
		event: ReactPointerEvent<HTMLDivElement>,
	) => Promise<void>;
	handleSurfaceDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
	handleSurfaceKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
	handleSurfacePointerCancel: (
		event: ReactPointerEvent<HTMLDivElement>,
	) => void;
	handleSurfacePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handleSurfacePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handleSurfacePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handleTopGutterClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
	hoveredAnnotationRecord: Annotation | null;
	hoveredTooltipPosition: {
		left: string;
		top: string;
		transform: string;
	} | null;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	previewAnnotationChange: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => void;
	resetAnnotationPreview: (annotationId: string) => void;
	setHoveredAnnotation: (
		value: {
			annotationId: string;
			x: number;
			y: number;
		} | null,
	) => void;
	sortedAnnotations: Annotation[];
	updateBottomGutterHover: (event: ReactPointerEvent<HTMLDivElement>) => void;
	updateGutterHoverFromEvent: (
		position: "top" | "bottom",
		event: ReactPointerEvent<HTMLDivElement>,
	) => void;
	updateHoveredAnnotationPosition: (
		annotationId: string,
		clientX: number,
		clientY: number,
	) => void;
}

export function WaveformCardSurface({
	activeAnnotationId,
	annotationOverlayRef,
	audioFile,
	bottomGutterDrag,
	canvasRef,
	canvasSurfaceRef,
	rulerSurfaceRef,
	clearGutterHover,
	clearHoveredAnnotation,
	commitAnnotationChange,
	getTimePerPixel,
	gutterHover,
	handleBottomGutterPointerCancel,
	handleBottomGutterPointerDown,
	handleBottomGutterPointerMove,
	handleBottomGutterPointerUp,
	handleSurfaceDoubleClick,
	handleSurfaceKeyDown,
	handleSurfacePointerCancel,
	handleSurfacePointerDown,
	handleSurfacePointerMove,
	handleSurfacePointerUp,
	handleTopGutterClick,
	hoveredAnnotationRecord,
	hoveredTooltipPosition,
	onDeleteAnnotation,
	onSeek,
	onSelectAnnotation,
	onSelectFile,
	previewAnnotationChange,
	resetAnnotationPreview,
	setHoveredAnnotation,
	sortedAnnotations,
	updateBottomGutterHover,
	updateGutterHoverFromEvent,
	updateHoveredAnnotationPosition,
}: WaveformCardSurfaceProps) {
	return (
		<div className="overflow-hidden border border-[var(--color-border-plain)]">
			<WaveformRuler
				durationMs={audioFile.durationMs}
				surfaceRef={rulerSurfaceRef}
				onPointerDown={handleSurfacePointerDown}
				onPointerMove={handleSurfacePointerMove}
				onPointerUp={handleSurfacePointerUp}
				onPointerCancel={handleSurfacePointerCancel}
				onDoubleClick={handleSurfaceDoubleClick}
			/>
			{/* biome-ignore lint/a11y/useSemanticElements: the waveform surface contains nested marker buttons, so a semantic button wrapper is not valid */}
			<div
				className="waveform-surface relative grid overflow-hidden border-t border-[var(--color-border-plain)]"
				style={{
					height:
						"calc(var(--song-workspace-waveform-height) + 2 * var(--waveform-marker-gutter-height))",
					gridTemplateRows:
						"var(--waveform-marker-gutter-height) minmax(0, 1fr) var(--waveform-marker-gutter-height)",
				}}
				role="button"
				tabIndex={0}
				aria-label={`Waveform for ${audioFile.title}`}
				onPointerLeave={() => {
					clearHoveredAnnotation();
					clearGutterHover();
				}}
				onPointerDown={handleSurfacePointerDown}
				onPointerMove={handleSurfacePointerMove}
				onPointerUp={handleSurfacePointerUp}
				onPointerCancel={handleSurfacePointerCancel}
				onDoubleClick={handleSurfaceDoubleClick}
				onKeyDown={handleSurfaceKeyDown}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only gutter quick-add; keyboard users cannot pick an arbitrary time on the gutter */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only quick-add affordance; the gutter does not behave as a single button because the click position picks the time */}
				<div
					className="waveform-surface__gutter relative min-h-0"
					data-testid="waveform-gutter-top"
					onPointerEnter={(event) => updateGutterHoverFromEvent("top", event)}
					onPointerMove={(event) => updateGutterHoverFromEvent("top", event)}
					onPointerLeave={clearGutterHover}
					onClick={handleTopGutterClick}
				>
					{gutterHover?.position === "top" ? (
						<span
							aria-hidden
							data-testid="gutter-add-marker-icon"
							className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
							style={{ left: `${gutterHover.x}px` }}
						>
							<Plus size={14} />
						</span>
					) : null}
				</div>
				<div
					ref={canvasSurfaceRef}
					className="relative min-h-0 min-w-0 overflow-hidden border-y border-[var(--color-border-plain)]"
					data-testid="waveform-canvas-surface"
				>
					<canvas ref={canvasRef} className="block h-full w-full min-w-0" />
				</div>
				<div
					className="waveform-surface__gutter relative min-h-0"
					data-testid="waveform-gutter-bottom"
					onPointerEnter={updateBottomGutterHover}
					onPointerMove={handleBottomGutterPointerMove}
					onPointerLeave={clearGutterHover}
					onPointerDown={handleBottomGutterPointerDown}
					onPointerUp={(event) => {
						void handleBottomGutterPointerUp(event);
					}}
					onPointerCancel={handleBottomGutterPointerCancel}
				>
					{bottomGutterDrag?.moved ? (
						<span
							aria-hidden
							data-testid="gutter-add-range-preview"
							className="pointer-events-none absolute top-1/2 -translate-y-1/2"
							style={{
								left: `${
									(Math.min(
										bottomGutterDrag.anchorTimeMs,
										bottomGutterDrag.currentTimeMs,
									) /
										Math.max(audioFile.durationMs, 1)) *
									100
								}%`,
								width: `${
									(Math.abs(
										bottomGutterDrag.currentTimeMs -
											bottomGutterDrag.anchorTimeMs,
									) /
										Math.max(audioFile.durationMs, 1)) *
									100
								}%`,
								height: "var(--waveform-marker-visual-height)",
								backgroundColor: "var(--color-marker-range)",
								opacity: 0.45,
							}}
						/>
					) : null}
					{gutterHover?.position === "bottom" && !bottomGutterDrag ? (
						<span
							aria-hidden
							data-testid="gutter-add-range-icon"
							className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
							style={{ left: `${gutterHover.x}px` }}
						>
							<Plus size={14} />
						</span>
					) : null}
				</div>
				<div
					ref={annotationOverlayRef}
					className="pointer-events-none absolute inset-0 z-20"
					data-testid="waveform-annotation-overlay"
				>
					<WaveformCardAnnotationLayer
						activeAnnotationId={activeAnnotationId}
						audioFile={audioFile}
						annotations={sortedAnnotations}
						hoveredAnnotationRecord={hoveredAnnotationRecord}
						hoveredTooltipPosition={hoveredTooltipPosition}
						onCommitAnnotationChange={commitAnnotationChange}
						onDeleteAnnotation={onDeleteAnnotation}
						onPreviewAnnotationChange={previewAnnotationChange}
						onResetAnnotationPreview={resetAnnotationPreview}
						onSeek={onSeek}
						onSelectAnnotation={onSelectAnnotation}
						onSelectFile={onSelectFile}
						getTimePerPixel={getTimePerPixel}
						setHoveredAnnotation={setHoveredAnnotation}
						updateHoveredAnnotationPosition={updateHoveredAnnotationPosition}
					/>
				</div>
			</div>
		</div>
	);
}
