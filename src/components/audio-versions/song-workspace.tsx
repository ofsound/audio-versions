import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import type {
	Annotation,
	GalleryScope,
	SongLinkTarget,
	SongRouteSearch,
} from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import {
	type GalleryGroup,
	GalleryStrip,
	GalleryViewer,
} from "./image-gallery";
import { InspectorPane } from "./inspector-pane";
import { PanelResizeHandle } from "./panel-resize-handle";
import { SongNotesTabs } from "./song-notes-tabs";
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
		settings,
		getSongById,
		getSongAudioFiles,
		getAnnotationsForFile,
		getWorkspaceState,
		blobsByAudioId,
		playback,
		rememberSongOpened,
		addAudioFile,
		addGalleryImages,
		removeGalleryImage,
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

	const songNotesFirst = settings.ui.songNotesFirst;
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
	const [galleryImageId, setGalleryImageId] = useState<string | null>(null);
	const [galleryBusy, setGalleryBusy] = useState(false);
	const [galleryError, setGalleryError] = useState<string | null>(null);
	const galleryBusyRef = useRef(false);
	const addImages = async (scope: GalleryScope, files: File[]) => {
		if (!files.length || galleryBusyRef.current) return;
		galleryBusyRef.current = true;
		setGalleryBusy(true);
		setGalleryError(null);
		try {
			await addGalleryImages(scope, files);
		} catch (error) {
			setGalleryError(
				error instanceof Error ? error.message : "Images could not be added.",
			);
		} finally {
			galleryBusyRef.current = false;
			setGalleryBusy(false);
		}
	};
	const { isFileDragActive, dropTarget } = useSongWorkspaceFileDrop({
		enabled:
			ready &&
			Boolean(song) &&
			!isUploadOpen &&
			!galleryImageId &&
			!galleryBusy,
		onAudioFileDrop: beginUploadWithFile,
		onImageFilesDrop: (target, files) => {
			if (target === "file" && !selectedFileId) {
				setGalleryError(
					"Select an audio file before adding images to its gallery.",
				);
				return;
			}
			void addImages(
				{
					songId,
					...(target === "file" ? { audioFileId: selectedFileId } : {}),
				},
				files,
			);
		},
		onDropError: setGalleryError,
	});

	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
	const [panelWidths, setPanelWidths] = useState<{
		left: number;
		center: number;
		right: number;
	} | null>(null);
	const workspaceGridRef = useRef<HTMLElement | null>(null);
	const [annotationDetailFocusId, setAnnotationDetailFocusId] = useState<
		string | null
	>(null);
	const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(
		null,
	);
	const handleAnnotationDetailFocusHandled = useCallback(() => {
		setAnnotationDetailFocusId(null);
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
					const left = grid.querySelector<HTMLElement>(
						'[data-song-workspace-panel="left"]',
					);
					const center = grid.querySelector<HTMLElement>(
						'[data-song-workspace-panel="center"]',
					);
					const right = grid.querySelector<HTMLElement>(
						'[data-song-workspace-panel="right"]',
					);
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
				const [first, second]: [keyof typeof panels, keyof typeof panels] =
					songNotesFirst
						? boundary === "left"
							? ["right", "left"]
							: ["left", "center"]
						: boundary === "left"
							? ["left", "center"]
							: ["center", "right"];
				const nextFirst = Math.min(
					Math.max(panels[first] + deltaX, minimumWidth),
					panels[first] + panels[second] - minimumWidth,
				);
				return {
					...panels,
					[first]: nextFirst,
					[second]: panels[first] + panels[second] - nextFirst,
				};
			});
		},
		[songNotesFirst],
	);

	const isModalOpen = isUploadOpen || Boolean(galleryImageId);

	useCloseOnEscape(isModalOpen, () => {
		setGalleryImageId(null);
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
		setAnnotationDetailFocusId(annotation.id);
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

	const songHeaderControls = <SongWorkspaceHeaderControls song={song} />;

	const renderedSongHeaderControls = songRouteHeaderSlot?.slot ? (
		createPortal(songHeaderControls, songRouteHeaderSlot.slot)
	) : songRouteHeaderSlot?.enabled ? null : (
		<section className="panel-shell px-6 py-6">{songHeaderControls}</section>
	);

	const hasAudioFiles = audioFiles.length > 0;
	const songGallery: GalleryGroup = {
		label: "Song gallery",
		scope: { songId },
		images: song.galleryImages ?? [],
	};
	const fileGallery: GalleryGroup | undefined = selectedFile
		? {
				label: `File gallery · ${selectedFile.title}`,
				scope: { songId, audioFileId: selectedFile.id },
				images: selectedFile.galleryImages ?? [],
			}
		: undefined;
	const galleryGroups = fileGallery
		? [songGallery, fileGallery]
		: [songGallery];
	const strip = (group: GalleryGroup) => (
		<GalleryStrip
			group={group}
			busy={galleryBusy}
			onOpen={setGalleryImageId}
			onAdd={(files) => void addImages(group.scope, files)}
		/>
	);
	const playerPanel = (
		<div
			key="player"
			className="flex min-w-0 flex-col gap-4 xl:h-full xl:min-h-0 xl:overflow-x-hidden xl:overflow-y-auto xl:pt-2 xl:pr-1"
			data-song-workspace-panel="left"
			data-gallery-drop-target="audio"
			data-drop-active={isFileDragActive && dropTarget === "audio"}
		>
			<SongWorkspaceWaveformList
				onHoverAnnotation={setHoveredAnnotationId}
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
				deletingFileId={deletingFileId}
				onDeleteFile={(fileId) => {
					void handleDeleteFile(fileId);
				}}
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
				onOpenUpload={() => setIsUploadOpen(true)}
			/>
		</div>
	);
	const detailsPanel = (
		<div
			key="details"
			className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden xl:pt-2"
			data-song-workspace-panel="center"
			data-gallery-drop-target="file"
			data-drop-active={isFileDragActive && dropTarget === "file"}
		>
			<div className="song-workspace-primary-surface flex min-h-0 flex-1 flex-col pr-1">
				<InspectorPane
					galleryFooter={fileGallery ? strip(fileGallery) : undefined}
					hoveredAnnotationId={hoveredAnnotationId}
					song={song}
					selectedFile={selectedFile}
					annotations={selectedAnnotations}
					activeAnnotation={activeAnnotation}
					annotationDetailFocusId={annotationDetailFocusId}
					onAnnotationDetailFocusHandled={handleAnnotationDetailFocusHandled}
					onOpenTarget={(target: SongLinkTarget) => openTarget(target)}
					onUpdateFile={handleSelectedFilePatch}
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
	);
	const journalPanel = (
		<div
			key="journal"
			className="song-workspace-journal-column flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden"
			data-song-workspace-panel="right"
			data-gallery-drop-target="song"
			data-drop-active={isFileDragActive && dropTarget === "song"}
		>
			<div className="flex min-h-0 flex-1 flex-col">
				<SongNotesTabs
					key={songId}
					song={song}
					workspace={workspace}
					history={history}
					requestedTabId={search.noteTabId}
					onTabChange={(noteTabId) =>
						navigate({
							to: "/songs/$songId",
							params: { songId },
							replace: true,
							resetScroll: false,
							search: (prev: SongRouteSearch) => ({
								...prev,
								noteTabId: noteTabId ?? undefined,
							}),
						})
					}
					onInternalLink={(target) => openTarget(target)}
				/>
				{(hasAudioFiles || songGallery.images.length > 0) && strip(songGallery)}
			</div>
		</div>
	);

	const emptyAudioPanel = (
		<section
			key="empty-audio"
			aria-label="Import audio"
			data-gallery-drop-target="audio"
			data-drop-active={isFileDragActive && dropTarget === "audio"}
			className="flex min-h-48 min-w-0 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-[var(--color-text-muted)]"
		>
			<p>Drag a track here</p>
			<div className="flex items-center gap-3">
				<span>or</span>
				<button
					type="button"
					onClick={() => setIsUploadOpen(true)}
					className="action-secondary inline-flex items-center gap-2 px-3 py-2"
				>
					<Upload size={14} />
					Import file
				</button>
			</div>
		</section>
	);

	return (
		<>
			{renderedSongHeaderControls}
			<main
				className={`song-workspace-main relative flex min-h-0 w-full flex-1 flex-col gap-6 overflow-hidden px-6 pt-2.5 md:py-4 xl:py-0 xl:pr-0 ${
					isModalOpen ? "pointer-events-none" : ""
				}`}
				aria-hidden={isModalOpen}
			>
				{galleryError && (
					<div
						role="alert"
						className="flex items-center justify-between gap-3 border border-[var(--color-border-plain)] p-3 text-sm"
					>
						<span>{galleryError}</span>
						<button
							type="button"
							className="action-secondary px-2 py-1"
							onClick={() => setGalleryError(null)}
						>
							Dismiss
						</button>
					</div>
				)}
				<section
					ref={workspaceGridRef}
					data-song-notes-first={songNotesFirst}
					data-song-workspace-empty={!hasAudioFiles}
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
					{!hasAudioFiles
						? songNotesFirst
							? [journalPanel, emptyAudioPanel]
							: [emptyAudioPanel, journalPanel]
						: songNotesFirst
							? [
									journalPanel,
									<PanelResizeHandle
										key="notes-player"
										label="Resize song notes and player panels"
										onResize={(deltaX) => resizePanels("left", deltaX)}
									/>,
									playerPanel,
									<PanelResizeHandle
										key="player-details"
										label="Resize player and file notes panels"
										onResize={(deltaX) => resizePanels("right", deltaX)}
									/>,
									detailsPanel,
								]
							: [
									playerPanel,
									<PanelResizeHandle
										key="player-details"
										label="Resize thumbnails and details panels"
										onResize={(deltaX) => resizePanels("left", deltaX)}
									/>,
									detailsPanel,
									<PanelResizeHandle
										key="details-notes"
										label="Resize details and song notes panels"
										onResize={(deltaX) => resizePanels("right", deltaX)}
									/>,
									journalPanel,
								]}
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

			{galleryImageId && (
				<GalleryViewer
					groups={galleryGroups}
					imageId={galleryImageId}
					onSelect={setGalleryImageId}
					onClose={() => setGalleryImageId(null)}
					busy={galleryBusy}
					onRemove={async (scope, imageId) => {
						await removeGalleryImage(scope, imageId);
					}}
				/>
			)}
			<SongWorkspaceFileDropzone
				active={isFileDragActive}
				target={dropTarget}
			/>
		</>
	);
}
