import { useEffect } from "react";
import { isEditableElement } from "#/lib/version-compare/dom";
import type { Annotation } from "#/lib/version-compare/types";

interface UseSongWorkspaceShortcutsOptions {
	activeAnnotationId?: string;
	isModalOpen: boolean;
	onDeleteActiveAnnotation: () => Promise<void>;
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
					'[data-version-compare-editor="journal"] .ProseMirror',
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
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
	]);
}
