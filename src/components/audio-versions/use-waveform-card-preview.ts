import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { Annotation } from "#/lib/audio-versions/types";
import { getHoveredTooltipPosition } from "./waveform-card-math";

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
}

interface UseWaveformCardPreviewOptions {
	annotationOverlayRef: RefObject<HTMLDivElement | null>;
	annotations: Annotation[];
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
}

export function useWaveformCardPreview({
	annotationOverlayRef,
	annotations,
	onUpdateAnnotation,
}: UseWaveformCardPreviewOptions) {
	const [annotationPreviewById, setAnnotationPreviewById] = useState<
		Record<string, Partial<Annotation>>
	>({});
	const [hoveredAnnotation, setHoveredAnnotation] =
		useState<HoveredAnnotationState | null>(null);

	const renderedAnnotations = useMemo(
		() =>
			annotations.map((annotation) => ({
				...annotation,
				...(annotationPreviewById[annotation.id] ?? {}),
			})),
		[annotationPreviewById, annotations],
	);

	const sortedAnnotations = useMemo(
		() =>
			[...renderedAnnotations].sort(
				(left, right) => left.startMs - right.startMs,
			),
		[renderedAnnotations],
	);

	const hoveredAnnotationRecord = useMemo(
		() =>
			hoveredAnnotation
				? (renderedAnnotations.find(
						(annotation) => annotation.id === hoveredAnnotation.annotationId,
					) ?? null)
				: null,
		[hoveredAnnotation, renderedAnnotations],
	);

	const hoveredTooltipPosition = useMemo(() => {
		if (!hoveredAnnotation || !annotationOverlayRef.current) {
			return null;
		}

		return getHoveredTooltipPosition(hoveredAnnotation.x, hoveredAnnotation.y, {
			width: annotationOverlayRef.current.clientWidth,
			height: annotationOverlayRef.current.clientHeight,
		});
	}, [annotationOverlayRef, hoveredAnnotation]);

	useEffect(() => {
		const annotationIds = new Set(
			annotations.map((annotation) => annotation.id),
		);
		setAnnotationPreviewById((current) => {
			const nextEntries = Object.entries(current).filter(([annotationId]) =>
				annotationIds.has(annotationId),
			);
			if (nextEntries.length === Object.keys(current).length) {
				return current;
			}

			return Object.fromEntries(nextEntries);
		});
	}, [annotations]);

	const previewAnnotationChange = useCallback(
		(annotationId: string, patch: Partial<Annotation>) => {
			setAnnotationPreviewById((current) => ({
				...current,
				[annotationId]: {
					...(current[annotationId] ?? {}),
					...patch,
				},
			}));
		},
		[],
	);

	const resetAnnotationPreview = useCallback((annotationId: string) => {
		setAnnotationPreviewById((current) => {
			if (!(annotationId in current)) {
				return current;
			}

			const next = { ...current };
			delete next[annotationId];
			return next;
		});
	}, []);

	const commitAnnotationChange = useCallback(
		async (annotationId: string, patch: Partial<Annotation>) => {
			previewAnnotationChange(annotationId, patch);
			try {
				await onUpdateAnnotation(annotationId, patch);
			} finally {
				resetAnnotationPreview(annotationId);
			}
		},
		[onUpdateAnnotation, previewAnnotationChange, resetAnnotationPreview],
	);

	const clearHoveredAnnotation = useCallback(() => {
		setHoveredAnnotation(null);
	}, []);

	const updateHoveredAnnotationPosition = useCallback(
		(annotationId: string, clientX: number, clientY: number) => {
			const overlay = annotationOverlayRef.current;
			if (!overlay) {
				return;
			}

			const rect = overlay.getBoundingClientRect();
			setHoveredAnnotation({
				annotationId,
				x: clientX - rect.left,
				y: clientY - rect.top,
			});
		},
		[annotationOverlayRef],
	);

	return {
		clearHoveredAnnotation,
		commitAnnotationChange,
		hoveredAnnotationRecord,
		hoveredTooltipPosition,
		previewAnnotationChange,
		resetAnnotationPreview,
		setHoveredAnnotation,
		sortedAnnotations,
		updateHoveredAnnotationPosition,
	};
}
