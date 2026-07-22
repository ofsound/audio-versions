import {
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useRef,
} from "react";

interface SeekDragState {
	pointerId: number;
	timeMs: number;
}

interface WaveformSeekClickState {
	clientX: number;
	timeMs: number;
}

interface UseWaveformSeekDragOptions {
	audioFileId: string;
	audioRef: RefObject<HTMLAudioElement | null>;
	durationMs: number;
	getWaveformTimeMs: (clientX: number) => number | null;
	isClientXYInCanvasSurface: (clientX: number, clientY: number) => boolean;
	onReportPlayback: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectFile: (fileId: string) => void;
}

export function useWaveformSeekDrag({
	audioFileId,
	audioRef,
	durationMs,
	getWaveformTimeMs,
	isClientXYInCanvasSurface,
	onReportPlayback,
	onSeek,
	onSelectFile,
}: UseWaveformSeekDragOptions) {
	const seekDragStateRef = useRef<SeekDragState | null>(null);
	const lastSeekClickRef = useRef<WaveformSeekClickState | null>(null);

	const clearSeekDragState = useCallback(
		(target: HTMLDivElement, pointerId: number): SeekDragState | null => {
			const dragState = seekDragStateRef.current;
			if (!dragState || dragState.pointerId !== pointerId) {
				return null;
			}

			seekDragStateRef.current = null;
			if (target.hasPointerCapture?.(pointerId)) {
				target.releasePointerCapture(pointerId);
			}
			return dragState;
		},
		[],
	);

	const handleSurfacePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (
				event.button !== 0 ||
				(event.target as HTMLElement).closest("[data-annotation-hit]")
			) {
				return;
			}

			if (!isClientXYInCanvasSurface(event.clientX, event.clientY)) {
				return;
			}

			const timeMs = getWaveformTimeMs(event.clientX);
			if (timeMs === null) {
				return;
			}

			onSelectFile(audioFileId);
			seekDragStateRef.current = {
				pointerId: event.pointerId,
				timeMs,
			};
			event.currentTarget.setPointerCapture?.(event.pointerId);

			if (audioRef.current) {
				audioRef.current.currentTime = timeMs / 1000;
			}
			onReportPlayback({ currentTimeMs: timeMs });
		},
		[
			audioFileId,
			audioRef,
			getWaveformTimeMs,
			isClientXYInCanvasSurface,
			onReportPlayback,
			onSelectFile,
		],
	);

	const handleSurfacePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const dragState = seekDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			const timeMs = getWaveformTimeMs(event.clientX);
			if (timeMs === null || timeMs === dragState.timeMs) {
				return;
			}

			dragState.timeMs = timeMs;
			if (audioRef.current) {
				audioRef.current.currentTime = timeMs / 1000;
			}
			onReportPlayback({ currentTimeMs: timeMs });
		},
		[audioRef, getWaveformTimeMs, onReportPlayback],
	);

	const handleSurfacePointerUp = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const dragState = clearSeekDragState(
				event.currentTarget,
				event.pointerId,
			);
			if (!dragState) {
				return;
			}

			lastSeekClickRef.current = {
				clientX: event.clientX,
				timeMs: dragState.timeMs,
			};
			void onSeek(dragState.timeMs, false);
		},
		[clearSeekDragState, onSeek],
	);

	const handleSurfacePointerCancel = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			clearSeekDragState(event.currentTarget, event.pointerId);
		},
		[clearSeekDragState],
	);

	const handleSurfaceDoubleClick = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if ((event.target as HTMLElement).closest("[data-annotation-hit]")) {
				return;
			}

			if (!isClientXYInCanvasSurface(event.clientX, event.clientY)) {
				return;
			}

			const lastSeekClick = lastSeekClickRef.current;
			const timeMs =
				lastSeekClick && Math.abs(lastSeekClick.clientX - event.clientX) <= 1
					? lastSeekClick.timeMs
					: getWaveformTimeMs(event.clientX);
			if (timeMs === null) {
				return;
			}

			onSelectFile(audioFileId);
			void onSeek(timeMs, true);
		},
		[
			audioFileId,
			getWaveformTimeMs,
			isClientXYInCanvasSurface,
			onSeek,
			onSelectFile,
		],
	);

	const handleSurfaceKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "Enter") {
				return;
			}

			event.preventDefault();
			void onSeek(Math.round(durationMs / 2));
		},
		[durationMs, onSeek],
	);

	return {
		handleSurfaceDoubleClick,
		handleSurfaceKeyDown,
		handleSurfacePointerCancel,
		handleSurfacePointerDown,
		handleSurfacePointerMove,
		handleSurfacePointerUp,
	};
}
