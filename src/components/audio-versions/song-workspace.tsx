import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import type {
	SongLinkTarget,
	SongRouteSearch,
} from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import { InspectorPane } from "./inspector-pane";
import { JournalEditor } from "./journal-editor";
import { SongWorkspaceFileDetailsDialog } from "./song-workspace-file-details-dialog";
import { SongWorkspaceHeaderControls } from "./song-workspace-header-controls";
import { useSongWorkspaceShortcuts } from "./song-workspace-shortcuts";
import { SongWorkspaceUploadDialog } from "./song-workspace-upload-dialog";
import { SongWorkspaceWaveformList } from "./song-workspace-waveform-list";
import { useCloseOnEscape } from "./use-close-on-escape";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";
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
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
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

	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
	const [editingFileId, setEditingFileId] = useState<string | null>(null);
	const [annotationTitleFocusId, setAnnotationTitleFocusId] = useState<
		string | null
	>(null);
	const handleAnnotationTitleFocusHandled = useCallback(() => {
		setAnnotationTitleFocusId(null);
	}, []);
	const previousSelectedFileIdRef = useRef<string | undefined>(selectedFileId);
	const previousIsPlayingRef = useRef(playback.isPlaying);

	const editingFile = useMemo(
		() =>
			editingFileId
				? (audioFiles.find((audioFile) => audioFile.id === editingFileId) ??
					null)
				: null,
		[audioFiles, editingFileId],
	);

	useEffect(() => {
		if (editingFileId && !editingFile) {
			setEditingFileId(null);
		}
	}, [editingFile, editingFileId]);

	const isFileDetailsOpen = Boolean(editingFile);
	const isModalOpen = isUploadOpen || isFileDetailsOpen;

	useCloseOnEscape(isModalOpen, () => {
		if (isFileDetailsOpen) {
			setEditingFileId(null);
			return;
		}

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
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
	});

	async function handleCreateAnnotation(
		fileId: string,
		input: Parameters<typeof createAnnotation>[0],
	) {
		const annotation = await createAnnotation(input);
		patchRouteSelection({
			fileId,
			annotationId: annotation.id,
			clearPlaybackParams: true,
		});
		setAnnotationTitleFocusId(annotation.id);
		return annotation;
	}

	const handleOpenFileDetails = useCallback(
		(fileId: string) => {
			if (fileId !== selectedFileId) {
				patchRouteSelection({
					fileId,
					clearPlaybackParams: true,
				});
			}
			setEditingFileId(fileId);
		},
		[patchRouteSelection, selectedFileId],
	);

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
			setEditingFileId((current) => (current === fileId ? null : current));
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
				className={`song-workspace-main relative flex min-h-0 w-full flex-1 flex-col gap-6 overflow-hidden px-3 pt-5 [transition:filter_200ms_ease,opacity_200ms_ease] md:py-8 ${
					isModalOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isModalOpen}
			>
				<section className="song-workspace-scroll-region grid min-h-0 flex-1 gap-5 overflow-y-auto xl:overflow-hidden xl:[grid-template-columns:minmax(0,50%)_minmax(280px,1fr)_420px] xl:[grid-template-rows:minmax(0,1fr)] xl:items-stretch">
					<div className="flex min-w-0 flex-col gap-4 xl:h-full xl:min-h-0 xl:overflow-x-hidden xl:overflow-y-auto xl:pr-[calc(0.25rem+var(--song-workspace-waveform-tab-width))]">
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
							onOpenFileDetails={handleOpenFileDetails}
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

					<div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col pr-1">
							<InspectorPane
								song={song}
								selectedFile={selectedFile}
								annotations={selectedAnnotations}
								activeAnnotation={activeAnnotation}
								annotationTitleFocusId={annotationTitleFocusId}
								onAnnotationTitleFocusHandled={
									handleAnnotationTitleFocusHandled
								}
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

					<div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col">
							<JournalEditor
								value={song.generalNotes}
								onChange={(nextValue) => persistSongJournal.schedule(nextValue)}
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

			{editingFile ? (
				<SongWorkspaceFileDetailsDialog
					audioFile={editingFile}
					deletingFile={deletingFileId === editingFile.id}
					onClose={() => setEditingFileId(null)}
					onDeleteFile={() => handleDeleteFile(editingFile.id)}
					onUpdateFile={(patch) => updateAudioFile(editingFile.id, patch)}
				/>
			) : null}
		</>
	);
}
