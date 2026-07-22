import {
	type DragEvent as ReactDragEvent,
	type RefObject,
	useRef,
} from "react";

interface UseWaveformCardDragHandleOptions {
	articleRef: RefObject<HTMLElement | null>;
	audioFileId: string;
	onDragEnd: () => void;
	onDragStart: () => void;
	onDrop: () => void;
	onSelectFile: (fileId: string) => void;
}

export function useWaveformCardDragHandle({
	articleRef,
	audioFileId,
	onDragEnd,
	onDragStart,
	onDrop,
	onSelectFile,
}: UseWaveformCardDragHandleOptions) {
	const isDragArmedRef = useRef(false);

	const setDragArmed = (isArmed: boolean) => {
		isDragArmedRef.current = isArmed;
		if (articleRef.current) {
			articleRef.current.draggable = isArmed;
		}
	};

	const handleArmDrag = () => {
		setDragArmed(true);
		onSelectFile(audioFileId);
	};

	const handleReleaseDrag = () => {
		setDragArmed(false);
	};

	const handleDragStart = (event: ReactDragEvent<HTMLElement>) => {
		if (!isDragArmedRef.current) {
			event.preventDefault();
			return;
		}

		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", audioFileId);

		const article = articleRef.current;
		if (article) {
			const bounds = article.getBoundingClientRect();
			const dragImageX = Number.isFinite(event.clientX)
				? Math.max(0, event.clientX - bounds.left)
				: 24;
			const dragImageY = Number.isFinite(event.clientY)
				? Math.max(0, event.clientY - bounds.top)
				: 24;
			event.dataTransfer.setDragImage(article, dragImageX, dragImageY);
		}

		onDragStart();
	};

	const handleDragEnd = () => {
		setDragArmed(false);
		onDragEnd();
	};

	const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
		event.preventDefault();
		onDrop();
	};

	return {
		handleArmDrag,
		handleDragEnd,
		handleDragStart,
		handleDrop,
		handleReleaseDrag,
	};
}
