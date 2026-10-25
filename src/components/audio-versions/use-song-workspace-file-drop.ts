import { useEffect, useRef, useState } from "react";
import {
	dataTransferLooksLikeFileDrag,
	isAudioFile,
} from "#/lib/audio-versions/audio-file-drop";

import { galleryImageContentType } from "#/lib/audio-versions/gallery-images";

type DropTarget = "audio" | "song" | "file";

interface UseSongWorkspaceFileDropOptions {
	onImageFilesDrop?: (target: "song" | "file", files: File[]) => void;
	onDropError?: (message: string) => void;
	enabled: boolean;
	onAudioFileDrop: (file: File) => void;
}

function targetFor(event: DragEvent): DropTarget {
	const element =
		event.target instanceof Element
			? event.target.closest("[data-gallery-drop-target]")
			: null;
	const target = element?.getAttribute("data-gallery-drop-target");
	return target === "song" || target === "file" ? target : "audio";
}

export function useSongWorkspaceFileDrop({
	enabled,
	onAudioFileDrop,
	onImageFilesDrop,
	onDropError,
}: UseSongWorkspaceFileDropOptions) {
	const [isFileDragActive, setIsFileDragActive] = useState(false);
	const [dropTarget, setDropTarget] = useState<DropTarget>("audio");
	const optionsRef = useRef({ onImageFilesDrop, onDropError });
	optionsRef.current = { onImageFilesDrop, onDropError };
	const dragDepthRef = useRef(0);
	const onAudioFileDropRef = useRef(onAudioFileDrop);
	onAudioFileDropRef.current = onAudioFileDrop;

	useEffect(() => {
		if (!enabled) {
			dragDepthRef.current = 0;
			setIsFileDragActive(false);
			const block = (event: DragEvent) => {
				if (dataTransferLooksLikeFileDrag(event.dataTransfer))
					event.preventDefault();
			};
			window.addEventListener("drop", block, true);
			window.addEventListener("dragover", block);
			return () => {
				window.removeEventListener("drop", block, true);
				window.removeEventListener("dragover", block);
			};
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
			setDropTarget(targetFor(event));
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
			setDropTarget(targetFor(event));
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

			const target = targetFor(event);
			const files = Array.from(event.dataTransfer?.files ?? []);
			const images = files.filter((file) => galleryImageContentType(file));
			const audio = files.filter(isAudioFile);
			const fail = (message: string) =>
				optionsRef.current.onDropError?.(message);
			if (images.length && audio.length) {
				fail("Drop audio and images separately.");
				return;
			}
			if (images.length) {
				if (images.length !== files.length) {
					fail("Choose PNG, JPEG, WebP, GIF, or AVIF images.");
					return;
				}
				if (target === "audio") {
					fail(
						"Drop images over Song Notes or file notes to choose their gallery.",
					);
					return;
				}
				optionsRef.current.onImageFilesDrop?.(target, images);
			} else if (audio.length) {
				if (target !== "audio") {
					fail("Drop audio over the player and track thumbnails.");
					return;
				}
				onAudioFileDropRef.current(audio[0]);
			} else if (files.length) {
				fail("Drop an audio file, or PNG, JPEG, WebP, GIF, or AVIF images.");
			}
		};

		const handleDragEnd = () => {
			resetDragState();
		};

		window.addEventListener("dragenter", handleDragEnter);
		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop, true);
		window.addEventListener("dragend", handleDragEnd);
		window.addEventListener("blur", handleDragEnd);

		return () => {
			window.removeEventListener("dragenter", handleDragEnter);
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop, true);
			window.removeEventListener("dragend", handleDragEnd);
			window.removeEventListener("blur", handleDragEnd);
			resetDragState();
		};
	}, [enabled]);

	return {
		isFileDragActive,
		dropTarget,
	};
}
