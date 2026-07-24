import { useEffect } from "react";
import { isEditableElement } from "#/lib/audio-versions/dom";
import type { Annotation } from "#/lib/audio-versions/types";

interface UseSongWorkspaceShortcutsOptions {
	activeAnnotationId?: string;
	isModalOpen: boolean;
	onDeleteActiveAnnotation: () => Promise<void>;
	onRedo: () => Promise<boolean>;
	onUndo: () => Promise<boolean>;
	selectedFileId?: string;
	songId: string;
	togglePlayback: (fileId: string) => Promise<void>;
	seekActiveBy: (deltaMs: number) => Promise<void>;
	jumpBetweenAnnotations: (
		songId: string,
		audioFileId: string,
		direction: "previous" | "next",
	) => Promise<Annotation | null>;
	patchRouteSelection: (options: {
		fileId?: string;
		annotationId?: string;
		clearPlaybackParams?: boolean;
	}) => void;
}

export function useSongWorkspaceShortcuts({
	activeAnnotationId,
	isModalOpen,
	onDeleteActiveAnnotation,
	onRedo,
	onUndo,
	selectedFileId,
	songId,
	togglePlayback,
	seekActiveBy,
	jumpBetweenAnnotations,
	patchRouteSelection,
}: UseSongWorkspaceShortcutsOptions) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isModalOpen) {
				return;
			}

			const commandKey = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();
			const isUndo = commandKey && key === "z" && !event.shiftKey;
			const isRedo =
				commandKey &&
				((key === "z" && event.shiftKey) ||
					(key === "y" && !event.metaKey && !event.shiftKey));
			if (
				(isUndo || isRedo) &&
				!event.altKey &&
				!event.repeat &&
				!event.isComposing &&
				!isEditableElement(event.target)
			) {
				event.preventDefault();
				void (isUndo ? onUndo() : onRedo());
				return;
			}

			if (isEditableElement(event.target) || !selectedFileId) {
				return;
			}

			if (
				(event.key === "Delete" || event.key === "Backspace") &&
				activeAnnotationId &&
				!event.repeat &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey
			) {
				event.preventDefault();
				if (!window.confirm("Delete this marker?")) {
					return;
				}
				void onDeleteActiveAnnotation();
				return;
			}

			if (event.key === " ") {
				event.preventDefault();
				void togglePlayback(selectedFileId);
			}

			if (
				event.key === "ArrowLeft" ||
				event.key === "," ||
				event.code === "Comma"
			) {
				event.preventDefault();
				void seekActiveBy(event.shiftKey ? -1000 : -5000);
			}

			if (
				event.key === "ArrowRight" ||
				event.key === "." ||
				event.code === "Period"
			) {
				event.preventDefault();
				void seekActiveBy(event.shiftKey ? 1000 : 5000);
			}

			if (event.shiftKey && event.key === "ArrowUp") {
				event.preventDefault();
				void jumpBetweenAnnotations(songId, selectedFileId, "previous").then(
					(annotation) => {
						if (!annotation) {
							return;
						}

						patchRouteSelection({
							fileId: selectedFileId,
							annotationId: annotation.id,
							clearPlaybackParams: true,
						});
					},
				);
			}

			if (event.shiftKey && event.key === "ArrowDown") {
				event.preventDefault();
				void jumpBetweenAnnotations(songId, selectedFileId, "next").then(
					(annotation) => {
						if (!annotation) {
							return;
						}

						patchRouteSelection({
							fileId: selectedFileId,
							annotationId: annotation.id,
							clearPlaybackParams: true,
						});
					},
				);
			}

			if (event.shiftKey && event.key.toLowerCase() === "j") {
				event.preventDefault();
				const journalNode = document.querySelector(
					'[data-audio-versions-editor="journal"] textarea',
				);

				if (journalNode instanceof HTMLElement) {
					journalNode.focus();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		activeAnnotationId,
		isModalOpen,
		jumpBetweenAnnotations,
		onDeleteActiveAnnotation,
		onRedo,
		onUndo,
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
	]);
}
