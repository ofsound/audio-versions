import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useState,
} from "react";

interface GutterHoverState {
	position: "top" | "bottom";
	x: number;
	timeMs: number;
}

interface UseWaveformGutterQuickAddOptions {
	audioFileId: string;
	createPointAnnotationAtTime: (timeMs: number) => Promise<void>;
	getWaveformTimeMs: (clientX: number) => number | null;
	onSelectFile: (fileId: string) => void;
	snapClientXToPlayhead: (clientX: number) => number;
}

export function useWaveformGutterQuickAdd({
	audioFileId,
	createPointAnnotationAtTime,
	getWaveformTimeMs,
	onSelectFile,
	snapClientXToPlayhead,
}: UseWaveformGutterQuickAddOptions) {
	const [gutterHover, setGutterHover] = useState<GutterHoverState | null>(null);

	const updateGutterHoverFromEvent = useCallback(
		(position: "top" | "bottom", event: ReactPointerEvent<HTMLDivElement>) => {
			const rect = event.currentTarget.getBoundingClientRect();
			const snappedClientX = snapClientXToPlayhead(event.clientX);
			const timeMs = getWaveformTimeMs(snappedClientX);
			if (timeMs === null) {
				return;
			}

			setGutterHover({
				position,
				x: snappedClientX - rect.left,
				timeMs,
			});
		},
		[getWaveformTimeMs, snapClientXToPlayhead],
	);

	const clearGutterHover = useCallback(() => {
		setGutterHover(null);
	}, []);

	const handleTopGutterClick = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			const timeMs = getWaveformTimeMs(snapClientXToPlayhead(event.clientX));
			if (timeMs === null) {
				return;
			}

			onSelectFile(audioFileId);
			void createPointAnnotationAtTime(timeMs);
		},
		[
			audioFileId,
			createPointAnnotationAtTime,
			getWaveformTimeMs,
			onSelectFile,
			snapClientXToPlayhead,
		],
	);

	return {
		clearGutterHover,
		gutterHover,
		handleTopGutterClick,
		updateGutterHoverFromEvent,
	};
}
