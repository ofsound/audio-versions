import { useEffect, useRef, useState } from "react";
import {
	dataTransferLooksLikeFileDrag,
	getAudioFileFromDataTransfer,
} from "#/lib/audio-versions/audio-file-drop";

interface UseSongWorkspaceFileDropOptions {
	enabled: boolean;
	onAudioFileDrop: (file: File) => void;
}

export function useSongWorkspaceFileDrop({
	enabled,
	onAudioFileDrop,
}: UseSongWorkspaceFileDropOptions) {
	const [isFileDragActive, setIsFileDragActive] = useState(false);
	const dragDepthRef = useRef(0);
	const onAudioFileDropRef = useRef(onAudioFileDrop);
	onAudioFileDropRef.current = onAudioFileDrop;

	useEffect(() => {
		if (!enabled) {
			dragDepthRef.current = 0;
			setIsFileDragActive(false);
			return;
		}

		const resetDragState = () => {
			dragDepthRef.current = 0;
			setIsFileDragActive(false);
		};

		const handleDragEnter = (event: DragEvent) => {
			if (!dataTransferLooksLikeFileDrag(event.dataTransfer)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current += 1;
			setIsFileDragActive(true);
		};

		const handleDragOver = (event: DragEvent) => {
			if (!dataTransferLooksLikeFileDrag(event.dataTransfer)) {
				return;
			}

			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "copy";
			}
			setIsFileDragActive(true);
		};

		const handleDragLeave = (event: DragEvent) => {
			if (!dataTransferLooksLikeFileDrag(event.dataTransfer)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
			if (dragDepthRef.current === 0) {
				setIsFileDragActive(false);
			}
		};

		const handleDrop = (event: DragEvent) => {
			if (!dataTransferLooksLikeFileDrag(event.dataTransfer)) {
				return;
			}

			event.preventDefault();
			resetDragState();

			const audioFile = getAudioFileFromDataTransfer(event.dataTransfer);
			if (!audioFile) {
				return;
			}

			onAudioFileDropRef.current(audioFile);
		};

		const handleDragEnd = () => {
			resetDragState();
		};

		window.addEventListener("dragenter", handleDragEnter);
		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);
		window.addEventListener("dragend", handleDragEnd);

		return () => {
			window.removeEventListener("dragenter", handleDragEnter);
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
			window.removeEventListener("dragend", handleDragEnd);
			resetDragState();
		};
	}, [enabled]);

	return {
		isFileDragActive,
	};
}
