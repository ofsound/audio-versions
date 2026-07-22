import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useRef,
	useState,
} from "react";

interface BottomGutterDragState {
	pointerId: number;
	anchorTimeMs: number;
	currentTimeMs: number;
	moved: boolean;
}

interface UseWaveformRangeDragOptions {
	audioFileId: string;
	createRangeAnnotationAtTime: (timeMs: number) => Promise<void>;
	createRangeAnnotationFromBounds: (
		startMs: number,
		endMs: number,
	) => Promise<void>;
	getWaveformTimeMs: (clientX: number) => number | null;
	onSelectFile: (fileId: string) => void;
	snapClientXToPlayhead: (clientX: number) => number;
	updateBottomGutterHover: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useWaveformRangeDrag({
	audioFileId,
	createRangeAnnotationAtTime,
	createRangeAnnotationFromBounds,
	getWaveformTimeMs,
	onSelectFile,
	snapClientXToPlayhead,
	updateBottomGutterHover,
}: UseWaveformRangeDragOptions) {
	const [bottomGutterDrag, setBottomGutterDrag] =
		useState<BottomGutterDragState | null>(null);
	const bottomGutterDragStateRef = useRef<BottomGutterDragState | null>(null);

	const clearBottomGutterDrag = useCallback(
		(target: HTMLDivElement, pointerId: number) => {
			bottomGutterDragStateRef.current = null;
			setBottomGutterDrag(null);
			if (target.hasPointerCapture?.(pointerId)) {
				target.releasePointerCapture(pointerId);
			}
		},
		[],
	);

	const handleBottomGutterPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			const timeMs = getWaveformTimeMs(snapClientXToPlayhead(event.clientX));
			if (timeMs === null) {
				return;
			}

			event.stopPropagation();
			onSelectFile(audioFileId);

			const dragState: BottomGutterDragState = {
				pointerId: event.pointerId,
				anchorTimeMs: timeMs,
				currentTimeMs: timeMs,
				moved: false,
			};
			bottomGutterDragStateRef.current = dragState;
			setBottomGutterDrag(dragState);
			event.currentTarget.setPointerCapture?.(event.pointerId);
		},
		[audioFileId, getWaveformTimeMs, onSelectFile, snapClientXToPlayhead],
	);

	const handleBottomGutterPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			updateBottomGutterHover(event);

			const dragState = bottomGutterDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			const timeMs = getWaveformTimeMs(event.clientX);
			if (timeMs === null || timeMs === dragState.currentTimeMs) {
				return;
			}

			const nextState: BottomGutterDragState = {
				...dragState,
				currentTimeMs: timeMs,
				moved: dragState.moved || timeMs !== dragState.anchorTimeMs,
			};
			bottomGutterDragStateRef.current = nextState;
			setBottomGutterDrag(nextState);
		},
		[getWaveformTimeMs, updateBottomGutterHover],
	);

	const handleBottomGutterPointerUp = useCallback(
		async (event: ReactPointerEvent<HTMLDivElement>) => {
			const dragState = bottomGutterDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			event.stopPropagation();
			clearBottomGutterDrag(event.currentTarget, event.pointerId);

			if (!dragState.moved) {
				await createRangeAnnotationAtTime(dragState.anchorTimeMs);
				return;
			}

			await createRangeAnnotationFromBounds(
				Math.min(dragState.anchorTimeMs, dragState.currentTimeMs),
				Math.max(dragState.anchorTimeMs, dragState.currentTimeMs),
			);
		},
		[
			clearBottomGutterDrag,
			createRangeAnnotationAtTime,
			createRangeAnnotationFromBounds,
		],
	);

	const handleBottomGutterPointerCancel = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const dragState = bottomGutterDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			clearBottomGutterDrag(event.currentTarget, event.pointerId);
		},
		[clearBottomGutterDrag],
	);

	return {
		bottomGutterDrag,
		handleBottomGutterPointerCancel,
		handleBottomGutterPointerDown,
		handleBottomGutterPointerMove,
		handleBottomGutterPointerUp,
	};
}
