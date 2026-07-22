import { type PointerEvent, useRef, useState } from "react";
import {
	hasRichTextContent,
	richTextPreview,
} from "#/lib/audio-versions/rich-text";
import type { Annotation, AudioFileRecord } from "#/lib/audio-versions/types";
import { formatDuration } from "#/lib/audio-versions/waveform";
import { useScrubDrag } from "./use-scrub-drag";

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
}

interface WaveformCardAnnotationLayerProps {
	activeAnnotationId?: string;
	audioFile: AudioFileRecord;
	annotations: Annotation[];
	hoveredAnnotationRecord: Annotation | null;
	hoveredTooltipPosition: {
		left: string;
		top: string;
		transform: string;
	} | null;
	onCommitAnnotationChange: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onPreviewAnnotationChange: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => void;
	onResetAnnotationPreview: (annotationId: string) => void;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	getTimePerPixel: () => number;
	setHoveredAnnotation: (annotation: HoveredAnnotationState | null) => void;
	updateHoveredAnnotationPosition: (
		annotationId: string,
		clientX: number,
		clientY: number,
	) => void;
}

export function WaveformCardAnnotationLayer({
	activeAnnotationId,
	audioFile,
	annotations,
	hoveredAnnotationRecord,
	hoveredTooltipPosition,
	onCommitAnnotationChange,
	onDeleteAnnotation,
	onPreviewAnnotationChange,
	onResetAnnotationPreview,
	onSeek,
	onSelectAnnotation,
	onSelectFile,
	getTimePerPixel,
	setHoveredAnnotation,
	updateHoveredAnnotationPosition,
}: WaveformCardAnnotationLayerProps) {
	const [reshapingRangeId, setReshapingRangeId] = useState<string | null>(null);
	const reshapePointerStartRef = useRef<{
		annotationId: string;
		pointerId: number;
		x: number;
		y: number;
	} | null>(null);
	const [adjustingPointMarkerId, setAdjustingPointMarkerId] = useState<
		string | null
	>(null);
	const {
		consumeSuppressedClick,
		getMarkerDragHandlers,
		getRangeBodyDragHandlers,
		getRangeEdgeDragHandlers,
	} = useScrubDrag({
		audioFileId: audioFile.id,
		durationMs: audioFile.durationMs,
		getTimePerPixel,
		onClearHover: () => setHoveredAnnotation(null),
		onCommitAnnotationChange,
		onDeleteAnnotation,
		onPreviewAnnotationChange,
		onResetAnnotationPreview,
		onSelectAnnotation,
		onSelectFile,
	});

	function attachReshapeTracking(
		annotationId: string,
		handlers: {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
		},
	) {
		const RESHAPE_INTENT_DISTANCE_PX = 3;

		return {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				reshapePointerStartRef.current = {
					annotationId,
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
				};
				handlers.onPointerDown(event);
			},
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
				const start = reshapePointerStartRef.current;
				if (
					start &&
					start.annotationId === annotationId &&
					start.pointerId === event.pointerId &&
					reshapingRangeId !== annotationId
				) {
					const dx = event.clientX - start.x;
					const dy = event.clientY - start.y;
					if (Math.hypot(dx, dy) >= RESHAPE_INTENT_DISTANCE_PX) {
						setReshapingRangeId(annotationId);
					}
				}
				handlers.onPointerMove(event);
			},
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerUp(event);
				reshapePointerStartRef.current = null;
				setReshapingRangeId(null);
			},
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerCancel(event);
				reshapePointerStartRef.current = null;
				setReshapingRangeId(null);
			},
		};
	}

	function attachPointMarkerAdjustTracking(
		annotationId: string,
		handlers: {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
		},
	) {
		return {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				if (
					event.button === 0 &&
					event.target instanceof Element &&
					event.target.closest("[data-marker-handle]")
				) {
					setAdjustingPointMarkerId(annotationId);
				}
				handlers.onPointerDown(event);
			},
			onPointerMove: handlers.onPointerMove,
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerUp(event);
				setAdjustingPointMarkerId(null);
			},
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerCancel(event);
				setAdjustingPointMarkerId(null);
			},
		};
	}

	return (
		<>
			{annotations.map((annotation) => {
				const left = `${(annotation.startMs / Math.max(audioFile.durationMs, 1)) * 100}%`;
				const width =
					annotation.type === "range" && annotation.endMs
						? `${((annotation.endMs - annotation.startMs) / Math.max(audioFile.durationMs, 1)) * 100}%`
						: undefined;

				if (annotation.type === "range" && annotation.endMs) {
					const rangeColor = annotation.color ?? "var(--color-marker-range)";
					const rangeBodyHandlers = attachReshapeTracking(
						annotation.id,
						getRangeBodyDragHandlers(
							annotation.id,
							annotation.startMs,
							annotation.endMs,
						),
					);
					const rangeStartDragHandlers = attachReshapeTracking(
						annotation.id,
						getRangeEdgeDragHandlers(
							annotation.id,
							"start",
							annotation.startMs,
							annotation.endMs,
						),
					);
					const rangeEndDragHandlers = attachReshapeTracking(
						annotation.id,
						getRangeEdgeDragHandlers(
							annotation.id,
							"end",
							annotation.startMs,
							annotation.endMs,
						),
					);

					return (
						<div
							key={annotation.id}
							className="absolute bottom-0 top-0 z-10"
							style={{
								left,
								width,
							}}
						>
							<div
								aria-hidden
								data-range-waveform-highlight
								className="pointer-events-none absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-height)]"
								style={{
									left: 0,
									width: "100%",
									backgroundColor:
										reshapingRangeId === annotation.id
											? `color-mix(in srgb, ${rangeColor} 32%, transparent)`
											: undefined,
								}}
							/>
							<button
								type="button"
								data-annotation-hit
								aria-label={`${buildAnnotationAriaLabel(annotation)} — gutter`}
								onPointerEnter={(event) =>
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									)
								}
								onPointerMove={(event) => {
									rangeBodyHandlers.onPointerMove(event);
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									);
								}}
								onPointerLeave={() => setHoveredAnnotation(null)}
								onPointerDown={rangeBodyHandlers.onPointerDown}
								onPointerUp={rangeBodyHandlers.onPointerUp}
								onPointerCancel={rangeBodyHandlers.onPointerCancel}
								onClick={(event) => {
									if (consumeSuppressedClick(annotation.id)) {
										event.preventDefault();
										event.stopPropagation();
										return;
									}

									event.stopPropagation();
									onSelectFile(audioFile.id);
									onSelectAnnotation(annotation.id);
									void onSeek(annotation.startMs, true);
								}}
								className={`pointer-events-auto absolute inset-x-0 bottom-0 cursor-grab border-0 bg-transparent p-0 transition-opacity duration-150 active:cursor-grabbing ${
									activeAnnotationId === annotation.id
										? "opacity-[0.34] hover:opacity-[0.5]"
										: "opacity-[0.2] hover:opacity-[0.34]"
								}`}
								style={{
									height: "var(--waveform-marker-gutter-height)",
								}}
							>
								<span
									aria-hidden
									className="pointer-events-none absolute top-1/2 left-0 right-0 -translate-y-1/2"
									style={{
										height: "var(--waveform-marker-visual-height)",
										backgroundColor: rangeColor,
									}}
								/>
							</button>
							<button
								type="button"
								data-annotation-hit
								aria-label={buildRangeHandleAriaLabel(annotation, "start")}
								onPointerDown={rangeStartDragHandlers.onPointerDown}
								onPointerMove={rangeStartDragHandlers.onPointerMove}
								onPointerUp={rangeStartDragHandlers.onPointerUp}
								onPointerCancel={rangeStartDragHandlers.onPointerCancel}
								className="pointer-events-auto absolute bottom-0 left-0 h-[var(--waveform-marker-gutter-height)] w-3 -translate-x-1/2"
							>
								<span
									aria-hidden
									className="absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-padding)] left-1/2 w-0.5 -translate-x-1/2 opacity-0"
									style={{ backgroundColor: rangeColor }}
								/>
								<span
									data-range-handle="start"
									onPointerEnter={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerMove={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerLeave={() => setHoveredAnnotation(null)}
									className="absolute bottom-0 left-1/2 h-full w-3 -translate-x-1/2 cursor-ew-resize"
								/>
							</button>
							<button
								type="button"
								data-annotation-hit
								aria-label={buildRangeHandleAriaLabel(annotation, "end")}
								onPointerDown={rangeEndDragHandlers.onPointerDown}
								onPointerMove={rangeEndDragHandlers.onPointerMove}
								onPointerUp={rangeEndDragHandlers.onPointerUp}
								onPointerCancel={rangeEndDragHandlers.onPointerCancel}
								className="pointer-events-auto absolute bottom-0 left-full h-[var(--waveform-marker-gutter-height)] w-3 -translate-x-1/2"
							>
								<span
									aria-hidden
									className="absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-padding)] left-1/2 w-0.5 -translate-x-1/2 opacity-0"
									style={{ backgroundColor: rangeColor }}
								/>
								<span
									data-range-handle="end"
									onPointerEnter={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerMove={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerLeave={() => setHoveredAnnotation(null)}
									className="absolute bottom-0 left-1/2 h-full w-3 -translate-x-1/2 cursor-ew-resize"
								/>
							</button>
						</div>
					);
				}

				const markerDragHandlers = attachPointMarkerAdjustTracking(
					annotation.id,
					getMarkerDragHandlers(annotation.id, annotation.startMs),
				);

				return (
					<div
						key={annotation.id}
						className="absolute top-0 bottom-[var(--waveform-marker-gutter-height)] z-10"
						style={{ left }}
					>
						<button
							type="button"
							data-annotation-hit
							aria-label={buildAnnotationAriaLabel(annotation)}
							onClick={(event) => {
								if (consumeSuppressedClick(annotation.id)) {
									event.preventDefault();
									event.stopPropagation();
									return;
								}

								event.stopPropagation();
								onSelectFile(audioFile.id);
								onSelectAnnotation(annotation.id);
								void onSeek(annotation.startMs, true);
							}}
							onPointerDown={markerDragHandlers.onPointerDown}
							onPointerMove={markerDragHandlers.onPointerMove}
							onPointerUp={markerDragHandlers.onPointerUp}
							onPointerCancel={markerDragHandlers.onPointerCancel}
							className="pointer-events-auto absolute top-0 bottom-0 left-1/2 w-3 -translate-x-1/2"
						>
							<span
								aria-hidden
								className={`pointer-events-none absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-height)] left-1/2 w-0.5 -translate-x-1/2 transition-opacity duration-100 ${
									adjustingPointMarkerId === annotation.id
										? "opacity-100"
										: "opacity-0"
								}`}
								style={{
									backgroundColor:
										annotation.color ?? "var(--color-marker-point)",
								}}
							/>
							<span
								data-marker-handle
								onPointerEnter={(event) =>
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									)
								}
								onPointerMove={(event) =>
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									)
								}
								onPointerLeave={() => setHoveredAnnotation(null)}
								className="absolute left-1/2 top-[var(--waveform-marker-gutter-padding)] -translate-x-1/2 cursor-pointer leading-none transition-[filter] duration-150 hover:brightness-125 hover:saturate-150"
							>
								<svg
									width={21}
									height={16.5}
									viewBox="0 0 14 11"
									className="block"
									aria-hidden={true}
								>
									{/* Visual triangle is shrunk by 6px on screen (4 viewBox units) and centered, while the SVG bounds preserve the original 21x16.5 hit/hover area. */}
									<polygon
										points="7,9 2.545,2 11.455,2"
										fill={annotation.color ?? "var(--color-marker-point)"}
									/>
								</svg>
							</span>
						</button>
					</div>
				);
			})}

			{hoveredAnnotationRecord && hoveredTooltipPosition ? (
				<div
					className="waveform-annotation-tooltip pointer-events-none absolute z-20"
					style={hoveredTooltipPosition}
				>
					<p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
						{formatAnnotationTime(hoveredAnnotationRecord)}
					</p>
					<p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
						{hoveredAnnotationRecord.title?.trim() ||
							(hoveredAnnotationRecord.type === "range"
								? "Untitled range"
								: "Untitled marker")}
					</p>
					{hasRichTextContent(hoveredAnnotationRecord.body) ? (
						<p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
							{richTextPreview(hoveredAnnotationRecord.body)}
						</p>
					) : null}
				</div>
			) : null}
		</>
	);
}

function formatAnnotationTime(annotation: Annotation): string {
	if (
		annotation.type === "range" &&
		typeof annotation.endMs === "number" &&
		annotation.endMs > annotation.startMs
	) {
		return `${formatDuration(annotation.startMs)} - ${formatDuration(annotation.endMs)}`;
	}

	return formatDuration(annotation.startMs);
}

function buildAnnotationAriaLabel(annotation: Annotation): string {
	const typeLabel = annotation.type === "range" ? "range" : "marker";
	const title = annotation.title?.trim() || `Untitled ${typeLabel}`;
	return `${title} at ${formatAnnotationTime(annotation)}`;
}

function buildRangeHandleAriaLabel(
	annotation: Annotation,
	edge: "start" | "end",
): string {
	const title = annotation.title.trim() || "Untitled range";
	return `Adjust ${edge} of ${title}`;
}
