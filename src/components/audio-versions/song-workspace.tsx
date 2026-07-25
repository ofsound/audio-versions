import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import type {
	Annotation,
	SongLinkTarget,
	SongRouteSearch,
} from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import { InspectorPane } from "./inspector-pane";
import { JournalEditor } from "./journal-editor";
import { PanelResizeHandle } from "./panel-resize-handle";
import { SongWorkspaceFileDropzone } from "./song-workspace-file-dropzone";
import { SongWorkspaceHeaderControls } from "./song-workspace-header-controls";
import { useSongWorkspaceShortcuts } from "./song-workspace-shortcuts";
import { SongWorkspaceUploadDialog } from "./song-workspace-upload-dialog";
import { SongWorkspaceWaveformList } from "./song-workspace-waveform-list";
import { useCloseOnEscape } from "./use-close-on-escape";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";
import { useSongWorkspaceFileDrop } from "./use-song-workspace-file-drop";
import { useSongWorkspaceHistory } from "./use-song-workspace-history";
import { useSongWorkspaceRouting } from "./use-song-workspace-routing";
import { useSongWorkspaceUpload } from "./use-song-workspace-upload";

export function SongWorkspace({
	songId,
	search,
}: {
	songId: string;
	search: SongRouteSearch;
}) {
	const navigate = useNavigate();
	const songRouteHeaderSlot = useSongRouteHeaderSlot();
	const {
		ready,
		getSongById,
		getSongAudioFiles,
		getAnnotationsForFile,
		getWorkspaceState,
		blobsByAudioId,
		playback,
		rememberSongOpened,
		updateSong,
		addAudioFile,
		updateAudioFile,
		deleteAudioFile,
		reorderAudioFiles,
		createAnnotation: persistCreateAnnotation,
		restoreAnnotation,
		updateAnnotation: persistUpdateAnnotation,
		deleteAnnotation: persistDeleteAnnotation,
		updateWorkspaceState,
		registerAudioElement,
		reportPlaybackState,
		togglePlayback,
		seekFile,
		seekActiveBy,
		jumpBetweenAnnotations,
	} = useAudioVersions();

	const song = getSongById(songId);
	const audioFiles = getSongAudioFiles(songId);
	const annotationsRef = useRef<Annotation[]>([]);
	annotationsRef.current = audioFiles.flatMap((audioFile) =>
		getAnnotationsForFile(audioFile.id),
	);
	const history = useSongWorkspaceHistory(songId);
	const workspace = getWorkspaceState(songId);
	const {
		activeAnnotation,
		activeAnnotationId,
		openTarget,
		patchRouteSelection,
		selectedAnnotations,
		selectedFile,
		selectedFileId,
	} = useSongWorkspaceRouting({
		audioFiles,
		getAnnotationsForFile,
		navigate,
		playback,
		ready,
		rememberSongOpened,
		search,
		seekFile,
		song,
		songId,
	});
	const {
		beginUploadWithFile,
		handleUpload,
		isUploadOpen,
		setIsUploadOpen,
		uploadError,
		uploadFile,
		uploadNotes,
		uploadSessionDate,
		uploadTitle,
		uploading,
		setUploadFile,
		setUploadNotes,
		setUploadSessionDate,
		setUploadTitle,
	} = useSongWorkspaceUpload({
		addAudioFile,
		patchRouteSelection,
		songId,
	});
	const { isFileDragActive } = useSongWorkspaceFileDrop({
		enabled: ready && Boolean(song) && !isUploadOpen,
		onAudioFileDrop: beginUploadWithFile,
	});

	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
	const [panelWidths, setPanelWidths] = useState<{
		left: number;
		center: number;
		right: number;
	} | null>(null);
	const workspaceGridRef = useRef<HTMLElement | null>(null);
	const [annotationTitleFocusId, setAnnotationTitleFocusId] = useState<
		string | null
	>(null);
	const [journalHistoryValue, setJournalHistoryValue] = useState<{
		revision: number;
		value: string;
	}>();
	const journalHistoryRevisionRef = useRef(0);
	const handleAnnotationTitleFocusHandled = useCallback(() => {
		setAnnotationTitleFocusId(null);
	}, []);
	const previousSelectedFileIdRef = useRef<string | undefined>(selectedFileId);
	const previousIsPlayingRef = useRef(playback.isPlaying);

	const resizePanels = useCallback(
		(boundary: "left" | "right", deltaX: number) => {
			const grid = workspaceGridRef.current;
			if (!grid || window.innerWidth < 1280) {
				return;
			}

			setPanelWidths((current) => {
				const panels = (() => {
					const [left, center, right] = [
						...grid.querySelectorAll<HTMLElement>(
							"[data-song-workspace-panel]",
						),
					];
					if (!left || !center || !right) {
						return null;
					}
					return {
						left: left.getBoundingClientRect().width,
						center: center.getBoundingClientRect().width,
						right: right.getBoundingClientRect().width,
					};
				})();
				if (!panels) {
					return current;
				}

				const minimumWidth = 240;
				if (boundary === "left") {
					const nextLeft = Math.min(
						Math.max(panels.left + deltaX, minimumWidth),
						panels.left + panels.center - minimumWidth,
					);
					return {
						...panels,
						left: nextLeft,
						center: panels.left + panels.center - nextLeft,
					};
				}

				const nextCenter = Math.min(
					Math.max(panels.center + deltaX, minimumWidth),
					panels.center + panels.right - minimumWidth,
				);
				return {
					...panels,
					center: nextCenter,
					right: panels.center + panels.right - nextCenter,
				};
			});
		},
		[],
	);

	const isModalOpen = isUploadOpen;

	useCloseOnEscape(isModalOpen, () => {
		setIsUploadOpen(false);
	});

	const currentTimeMs =
		(selectedFileId
			? playback.currentTimeByFileId[selectedFileId]
			: undefined) ??
		(selectedFileId
			? workspace.playheadMsByFileId[selectedFileId]
			: undefined) ??
		0;
	const persistedSecond = Math.round(currentTimeMs / 1000);
	const persistWorkspacePlayhead = useDebouncedAsyncCallback({
		callback: async (fileId: string, timeMs: number) => {
			await updateWorkspaceState(songId, (current) => ({
				...current,
				playheadMsByFileId: {
					...current.playheadMsByFileId,
					[fileId]: timeMs,
				},
			}));
		},
		delayMs: DEBOUNCE_MS.playhead,
	});
	const persistSelectedFileNotes = useDebouncedAsyncCallback({
		callback: async (
			fileId: string,
			notes: NonNullable<typeof selectedFile>["notes"],
		) => {
			await updateAudioFile(fileId, {
				notes,
			});
		},
		delayMs: DEBOUNCE_MS.notes,
	});
	const persistSongJournal = useDebouncedAsyncCallback({
		callback: async (generalNotes: string) => {
			await updateSong(songId, {
				generalNotes,
			});
		},
		delayMs: DEBOUNCE_MS.journal,
	});

	const recordJournalChange = useCallback(
		(previousValue: string, nextValue: string) => {
			const applyJournalHistory = async (value: string) => {
				persistSongJournal.cancel();
				journalHistoryRevisionRef.current += 1;
				setJournalHistoryValue({
					revision: journalHistoryRevisionRef.current,
					value,
				});
				await updateSong(songId, { generalNotes: value });
			};
			history.record({
				mergeKey: `journal:${songId}`,
				undo: () => applyJournalHistory(previousValue),
				redo: () => applyJournalHistory(nextValue),
			});
		},
		[history, persistSongJournal, songId, updateSong],
	);

	const updateAnnotation = useCallback(
		async (annotationId: string, patch: Partial<Annotation>) => {
			const before = annotationsRef.current.find(
				(annotation) => annotation.id === annotationId,
			);
			if (!before) {
				await persistUpdateAnnotation(annotationId, patch);
				return;
			}
			const previousPatch = Object.fromEntries(
				Object.keys(patch).map((key) => [key, before[key as keyof Annotation]]),
			) as Partial<Annotation>;
			await persistUpdateAnnotation(annotationId, patch);
			history.record({
				mergeKey: `annotation:${annotationId}:${Object.keys(patch).sort().join(",")}`,
				undo: () => persistUpdateAnnotation(annotationId, previousPatch),
				redo: () => persistUpdateAnnotation(annotationId, patch),
			});
		},
		[history, persistUpdateAnnotation],
	);

	const deleteAnnotation = useCallback(
		async (annotationId: string) => {
			const annotation = annotationsRef.current.find(
				(entry) => entry.id === annotationId,
			);
			await persistDeleteAnnotation(annotationId);
			if (!annotation) {
				return;
			}
			history.record({
				undo: () => restoreAnnotation(annotation),
				redo: () => persistDeleteAnnotation(annotationId),
			});
		},
		[history, persistDeleteAnnotation, restoreAnnotation],
	);

	useEffect(() => {
		return () => {
			void persistSongJournal.flush();
		};
	}, [persistSongJournal]);

	useEffect(() => {
		if (!selectedFileId) {
			return;
		}

		persistWorkspacePlayhead.schedule(selectedFileId, persistedSecond * 1000);
	}, [persistWorkspacePlayhead, persistedSecond, selectedFileId]);

	useEffect(() => {
		if (!selectedFileId) {
			previousIsPlayingRef.current = playback.isPlaying;
			return;
		}

		const didStopPlaying = previousIsPlayingRef.current && !playback.isPlaying;
		previousIsPlayingRef.current = playback.isPlaying;
		if (!didStopPlaying) {
			return;
		}

		void persistWorkspacePlayhead.flush();
	}, [persistWorkspacePlayhead, playback.isPlaying, selectedFileId]);

	useEffect(() => {
		if (
			previousSelectedFileIdRef.current &&
			previousSelectedFileIdRef.current !== selectedFileId
		) {
			void persistWorkspacePlayhead.flush();
			void persistSelectedFileNotes.flush();
		}

		previousSelectedFileIdRef.current = selectedFileId;
	}, [persistSelectedFileNotes, persistWorkspacePlayhead, selectedFileId]);

	const handleSelectedFilePatch = useCallback(
		(patch: Parameters<typeof updateAudioFile>[1]) => {
			if (!selectedFile) {
				return Promise.resolve();
			}

			if (patch.notes) {
				persistSelectedFileNotes.schedule(selectedFile.id, patch.notes);
				return Promise.resolve();
			}

			return updateAudioFile(selectedFile.id, patch);
		},
		[persistSelectedFileNotes, selectedFile, updateAudioFile],
	);

	const handleDeleteActiveAnnotation = useCallback(async () => {
		if (!activeAnnotationId) {
			return;
		}

		await deleteAnnotation(activeAnnotationId);
		if (selectedFileId) {
			patchRouteSelection({
				fileId: selectedFileId,
				clearPlaybackParams: true,
			});
		}
	}, [
		activeAnnotationId,
		deleteAnnotation,
		patchRouteSelection,
		selectedFileId,
	]);

	useSongWorkspaceShortcuts({
		activeAnnotationId,
		isModalOpen,
		jumpBetweenAnnotations,
		onDeleteActiveAnnotation: handleDeleteActiveAnnotation,
		onRedo: history.redo,
		onUndo: history.undo,
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
	});

	async function handleCreateAnnotation(
		fileId: string,
		input: Parameters<typeof persistCreateAnnotation>[0],
	) {
		const annotation = await persistCreateAnnotation(input);
		history.record({
			undo: () => persistDeleteAnnotation(annotation.id),
			redo: () => restoreAnnotation(annotation),
		});
		patchRouteSelection({
			fileId,
			annotationId: annotation.id,
			clearPlaybackParams: true,
		});
		setAnnotationTitleFocusId(annotation.id);
		return annotation;
	}

	async function handleDeleteFile(fileId: string) {
		if (!window.confirm("Delete this file?")) {
			return;
		}

		const selectedIndex = audioFiles.findIndex(
			(audioFile) => audioFile.id === fileId,
		);
		const fallbackFileId =
			audioFiles[selectedIndex + 1]?.id ?? audioFiles[selectedIndex - 1]?.id;

		setDeletingFileId(fileId);
		try {
			await deleteAudioFile(fileId);
			patchRouteSelection({
				fileId: fallbackFileId,
				clearPlaybackParams: true,
			});
		} finally {
			setDeletingFileId((current) => (current === fileId ? null : current));
		}
	}

	if (!ready) {
		return (
			<main className="w-full px-3 py-8">
				<section className="panel-shell px-6 py-8 text-sm text-[var(--color-text-muted)]">
					Loading song workspace...
				</section>
			</main>
		);
	}

	if (!song) {
		return (
			<main className="w-full px-3 py-8">
				<section className="panel-shell px-6 py-8">
					<p className="eyebrow mb-3">Missing song</p>
					<h1 className="font-title text-3xl font-semibold text-[var(--color-text)]">
						This song record was not found in local storage.
					</h1>
					<Link
						to="/"
						className="action-secondary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold no-underline"
					>
						<ChevronLeft size={14} />
						Back to library
					</Link>
				</section>
			</main>
		);
	}

	const songHeaderControls = (
		<SongWorkspaceHeaderControls
			song={song}
			onOpenUpload={() => setIsUploadOpen(true)}
		/>
	);

	const renderedSongHeaderControls = songRouteHeaderSlot?.slot ? (
		createPortal(songHeaderControls, songRouteHeaderSlot.slot)
	) : songRouteHeaderSlot?.enabled ? null : (
		<section className="panel-shell px-6 py-6">{songHeaderControls}</section>
	);

	return (
		<>
			{renderedSongHeaderControls}
			<main
				className={`song-workspace-main relative flex min-h-0 w-full flex-1 flex-col gap-6 overflow-hidden px-3 pt-2.5 [transition:filter_200ms_ease,opacity_200ms_ease] md:py-4 xl:py-0 xl:pr-0 ${
					isModalOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isModalOpen}
			>
				<section
					ref={workspaceGridRef}
					className="song-workspace-scroll-region song-workspace-panel-grid grid min-h-0 flex-1 gap-5 overflow-y-auto xl:overflow-hidden xl:[grid-template-rows:minmax(0,1fr)] xl:items-stretch"
					style={
						panelWidths
							? ({
									"--song-workspace-left-panel-width": `${panelWidths.left}px`,
									"--song-workspace-center-panel-width": `${panelWidths.center}px`,
									"--song-workspace-right-panel-width": `minmax(${panelWidths.right}px, 1fr)`,
								} as CSSProperties)
							: undefined
					}
				>
					<div
						className="flex min-w-0 flex-col gap-4 xl:h-full xl:min-h-0 xl:overflow-x-hidden xl:overflow-y-auto xl:pt-2 xl:pr-1"
						data-song-workspace-panel="left"
					>
						<SongWorkspaceWaveformList
							activeAnnotationId={activeAnnotationId}
							audioFiles={audioFiles}
							blobsByAudioId={blobsByAudioId}
							getAnnotationsForFile={getAnnotationsForFile}
							handleCreateAnnotation={(fileId, annotationInput) =>
								handleCreateAnnotation(fileId, {
									...annotationInput,
									songId,
									audioFileId: fileId,
								})
							}
							playback={playback}
							registerAudioElement={registerAudioElement}
							reorderAudioFiles={reorderAudioFiles}
							reportPlaybackState={reportPlaybackState}
							seekFile={seekFile}
							selectedFileId={selectedFileId}
							songId={songId}
							togglePlayback={togglePlayback}
							updateAnnotation={updateAnnotation}
							deleteAnnotation={deleteAnnotation}
							updateAudioFile={updateAudioFile}
							workspacePlayheadMsByFileId={workspace.playheadMsByFileId}
							onSelectFile={(fileId) =>
								patchRouteSelection({
									fileId,
									clearPlaybackParams: true,
								})
							}
							onSelectAnnotation={(fileId, annotationId) =>
								patchRouteSelection({
									fileId,
									annotationId,
									clearPlaybackParams: true,
								})
							}
						/>
					</div>

					<PanelResizeHandle
						label="Resize thumbnails and details panels"
						onResize={(deltaX) => resizePanels("left", deltaX)}
					/>

					<div
						className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden xl:pt-2"
						data-song-workspace-panel="center"
					>
						<div className="song-workspace-primary-surface flex min-h-0 flex-1 flex-col pr-1">
							<InspectorPane
								song={song}
								selectedFile={selectedFile}
								selectedFileBlob={
									selectedFileId ? blobsByAudioId[selectedFileId] : undefined
								}
								annotations={selectedAnnotations}
								activeAnnotation={activeAnnotation}
								deletingFile={
									selectedFileId ? deletingFileId === selectedFileId : false
								}
								annotationTitleFocusId={annotationTitleFocusId}
								onAnnotationTitleFocusHandled={
									handleAnnotationTitleFocusHandled
								}
								onOpenTarget={(target: SongLinkTarget) => openTarget(target)}
								onUpdateFile={handleSelectedFilePatch}
								onDeleteFile={() => {
									if (!selectedFileId) {
										return;
									}
									void handleDeleteFile(selectedFileId);
								}}
								onUpdateAnnotation={updateAnnotation}
								onDeleteAnnotation={deleteAnnotation}
								onSelectAnnotation={(annotationId) => {
									if (!selectedFileId) {
										return;
									}

									patchRouteSelection({
										fileId: selectedFileId,
										annotationId,
										clearPlaybackParams: true,
									});
								}}
							/>
						</div>
					</div>

					<PanelResizeHandle
						label="Resize details and song notes panels"
						onResize={(deltaX) => resizePanels("right", deltaX)}
					/>

					<div
						className="song-workspace-journal-column flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden"
						data-song-workspace-panel="right"
					>
						<div className="flex min-h-0 flex-1 flex-col">
							<JournalEditor
								historyValue={journalHistoryValue}
								value={song.generalNotes}
								onChange={(nextValue) => persistSongJournal.schedule(nextValue)}
								onHistoryChange={recordJournalChange}
								onLocalHistoryAction={history.acceptLocalHistoryAction}
								onInternalLink={(target) => openTarget(target)}
							/>
						</div>
					</div>
				</section>
			</main>

			{isUploadOpen && (
				<SongWorkspaceUploadDialog
					uploadFile={uploadFile}
					uploadTitle={uploadTitle}
					uploadNotes={uploadNotes}
					uploadSessionDate={uploadSessionDate}
					uploading={uploading}
					uploadError={uploadError}
					onClose={() => setIsUploadOpen(false)}
					onSubmit={handleUpload}
					onFileChange={(nextFile) => {
						setUploadFile(nextFile);
						if (nextFile && !uploadTitle) {
							setUploadTitle(nextFile.name.replace(/\.[^.]+$/, ""));
						}
					}}
					onUploadTitleChange={setUploadTitle}
					onUploadNotesChange={setUploadNotes}
					onUploadSessionDateChange={setUploadSessionDate}
				/>
			)}

			<SongWorkspaceFileDropzone active={isFileDragActive} />
		</>
	);
}
