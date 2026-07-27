import { Link, useNavigate } from "@tanstack/react-router";
import {
	Bookmark,
	Calendar,
	File,
	FolderOpenDot,
	Plus,
	Settings,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAudioFileSessionDateRange } from "#/lib/audio-versions/dates";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useLibraryHeaderActionSlot } from "./app-chrome";
import { SongModal } from "./song-modal";
import { SongSettingsDialog } from "./song-settings-dialog";
import { useCloseOnEscape } from "./use-close-on-escape";

export function LibraryView() {
	const navigate = useNavigate();
	const libraryHeaderActionSlot = useLibraryHeaderActionSlot();
	const {
		ready,
		songs,
		audioFiles,
		annotations,
		settings,
		createSong,
		updateSong,
		deleteSong,
	} = useAudioVersions();
	const [title, setTitle] = useState("");
	const [artist, setArtist] = useState("");
	const [project, setProject] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
	const [editingSongId, setEditingSongId] = useState<string | null>(null);
	const [isCreateSongOpen, setIsCreateSongOpen] = useState(false);
	const createSongTitleInputRef = useRef<HTMLInputElement | null>(null);

	const recentSongIds = settings.recents;
	const { showArtist, showProject } = settings.ui;
	const orderedSongs = useMemo(() => {
		const recencyMap = new Map(recentSongIds.map((id, index) => [id, index]));

		return [...songs].sort((left, right) => {
			const leftRecent = recencyMap.get(left.id);
			const rightRecent = recencyMap.get(right.id);

			if (typeof leftRecent === "number" && typeof rightRecent === "number") {
				return leftRecent - rightRecent;
			}

			if (typeof leftRecent === "number") {
				return -1;
			}

			if (typeof rightRecent === "number") {
				return 1;
			}

			return right.updatedAt.localeCompare(left.updatedAt);
		});
	}, [recentSongIds, songs]);
	const editingSong = useMemo(
		() => songs.find((song) => song.id === editingSongId) ?? null,
		[editingSongId, songs],
	);
	const audioFileCountBySongId = useMemo(() => {
		const counts = new Map<string, number>();

		for (const audioFile of audioFiles) {
			counts.set(audioFile.songId, (counts.get(audioFile.songId) ?? 0) + 1);
		}

		return counts;
	}, [audioFiles]);
	const sessionDateRangeBySongId = useMemo(() => {
		const filesBySongId = new Map<string, typeof audioFiles>();

		for (const audioFile of audioFiles) {
			const existing = filesBySongId.get(audioFile.songId);
			if (existing) {
				existing.push(audioFile);
			} else {
				filesBySongId.set(audioFile.songId, [audioFile]);
			}
		}

		const ranges = new Map<string, string>();
		for (const [songId, songAudioFiles] of filesBySongId) {
			const range = formatAudioFileSessionDateRange(songAudioFiles);
			if (range) {
				ranges.set(songId, range);
			}
		}

		return ranges;
	}, [audioFiles]);
	const annotationCountBySongId = useMemo(() => {
		const counts = new Map<string, number>();

		for (const annotation of annotations) {
			counts.set(annotation.songId, (counts.get(annotation.songId) ?? 0) + 1);
		}

		return counts;
	}, [annotations]);
	const isModalOpen = isCreateSongOpen || Boolean(editingSong);

	useCloseOnEscape(isModalOpen, () => {
		if (editingSong) {
			setEditingSongId(null);
			return;
		}

		setIsCreateSongOpen(false);
	});

	useEffect(() => {
		if (editingSongId && !editingSong) {
			setEditingSongId(null);
		}
	}, [editingSong, editingSongId]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!title.trim()) {
			return;
		}

		setSubmitting(true);
		try {
			const song = await createSong({
				title,
				artist: showArtist ? artist : "",
				project: showProject ? project : "",
				generalNotes: "",
			});

			setTitle("");
			setArtist("");
			setProject("");
			setIsCreateSongOpen(false);
			navigate({
				to: "/songs/$songId",
				params: {
					songId: song.id,
				},
			});
		} finally {
			setSubmitting(false);
		}
	}

	async function handleDeleteSong(songId: string) {
		if (!window.confirm("Delete this song?")) {
			return;
		}

		setDeletingSongId(songId);
		try {
			await deleteSong(songId);
			setEditingSongId((current) => (current === songId ? null : current));
		} finally {
			setDeletingSongId((current) => (current === songId ? null : current));
		}
	}

	const createSongTrigger = (
		<button
			type="button"
			onClick={() => setIsCreateSongOpen(true)}
			className="action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold leading-none"
		>
			<Plus size={18} />
			Create song
		</button>
	);
	const renderedCreateSongTrigger = libraryHeaderActionSlot?.slot
		? createPortal(createSongTrigger, libraryHeaderActionSlot.slot)
		: libraryHeaderActionSlot?.enabled
			? null
			: createSongTrigger;

	return (
		<>
			{renderedCreateSongTrigger}
			<main
				className={`flex w-full flex-col gap-8 px-3 py-8 [transition:filter_200ms_ease,opacity_200ms_ease] ${
					isModalOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isModalOpen}
			>
				{!ready ? (
					<div className="flex min-h-[calc(100dvh-9rem)] flex-1 items-center justify-center">
						<section className="panel-shell w-fit max-w-[min(28rem,100%)] px-6 py-5 text-sm text-[var(--color-text-muted)]">
							Loading your local Audio Versions library...
						</section>
					</div>
				) : (
					<div className="flex min-w-0 flex-col gap-8">
						{songs.length === 0 ? (
							<section className="panel-shell px-7 py-10">
								<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
									<div className="max-w-3xl">
										<p className="eyebrow mb-3">Guided empty state</p>
										<h2 className="font-title text-3xl font-semibold text-[var(--color-text)]">
											Start by creating a song, then upload audio files into it.
										</h2>
										<p className="mt-4 text-base leading-8 text-[var(--color-text-muted)]">
											Each audio file becomes a full waveform lane. You can
											seek, create point markers or regions, keep file-level
											notes, and maintain persistent song notes on the right.
										</p>
									</div>
									<div className="border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-5 py-5">
										<div className="flex items-start gap-3 text-sm leading-7 text-[var(--color-text-muted)]">
											<Sparkles
												size={16}
												className="mt-1 text-[var(--color-accent)]"
											/>
											<div>
												Use the global search bar once you have content. It
												jumps across songs, notes, and time-based annotations.
											</div>
										</div>
									</div>
								</div>
							</section>
						) : (
							<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{orderedSongs.map((song) => {
									const sessionDateRange = sessionDateRangeBySongId.get(
										song.id,
									);
									return (
										<div
											key={song.id}
											className="panel-shell panel-shell--plain panel-shell-action relative h-full w-full p-6 text-left"
										>
											<Link
												to="/songs/$songId"
												params={{ songId: song.id }}
												aria-label={`Open ${song.title}`}
												className="absolute inset-0 cursor-pointer"
											/>
											<div className="flex items-start gap-2">
												<div className="block min-w-0 flex-1 text-left">
													<div>
														<h2 className="font-title text-2xl font-semibold text-[var(--color-text)]">
															{song.title}
														</h2>
														{showArtist ? (
															<p className="mt-2 text-sm text-[var(--color-text-muted)]">
																{song.artist || "No artist set"}
															</p>
														) : null}
													</div>
												</div>
												<button
													type="button"
													onClick={() => setEditingSongId(song.id)}
													className="icon-button icon-button--sm relative z-10 -mt-0.5 shrink-0"
													title="Edit song settings"
													aria-label={`Edit settings for ${song.title}`}
												>
													<Settings size={12} />
												</button>
											</div>

											<div className="mt-6 flex flex-wrap items-center gap-2">
												<StatChip
													icon={<File size={14} />}
													label={`${
														audioFileCountBySongId.get(song.id) ?? 0
													} files`}
												/>
												<StatChip
													icon={<Bookmark size={14} />}
													label={`${
														annotationCountBySongId.get(song.id) ?? 0
													} markers`}
												/>
												{sessionDateRange ? (
													<StatChip
														icon={<Calendar size={14} />}
														label={sessionDateRange}
													/>
												) : null}
											</div>
										</div>
									);
								})}
							</section>
						)}
					</div>
				)}
			</main>

			{isCreateSongOpen && (
				<SongModal
					title="Create song"
					titleId="create-song-title"
					onClose={() => setIsCreateSongOpen(false)}
					initialFocusRef={createSongTitleInputRef}
					maxWidthClassName="max-w-[min(96rem,calc(100vw-2rem))]"
				>
					<form className="grid gap-4 p-5 sm:p-6" onSubmit={handleSubmit}>
						<label className="grid gap-2">
							<span className="field-label">Song title</span>
							<input
								ref={createSongTitleInputRef}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Song title"
								className="field-input"
							/>
						</label>
						{showArtist ? (
							<label className="grid gap-2">
								<span className="field-label">Artist</span>
								<input
									value={artist}
									onChange={(event) => setArtist(event.target.value)}
									placeholder="Artist"
									className="field-input"
								/>
							</label>
						) : null}
						{showProject ? (
							<label className="grid gap-2">
								<span className="field-label">Project</span>
								<input
									value={project}
									onChange={(event) => setProject(event.target.value)}
									placeholder="Project"
									className="field-input"
								/>
							</label>
						) : null}
						<div className="flex justify-end">
							<button
								type="submit"
								disabled={submitting || !title.trim()}
								className="action-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
							>
								<FolderOpenDot size={16} />
								{submitting ? "Creating song..." : "Create song"}
							</button>
						</div>
					</form>
				</SongModal>
			)}

			{editingSong ? (
				<SongSettingsDialog
					song={editingSong}
					deletingSong={deletingSongId === editingSong.id}
					showArtist={showArtist}
					showProject={showProject}
					onClose={() => setEditingSongId(null)}
					onDeleteSong={() => handleDeleteSong(editingSong.id)}
					onUpdateSong={(patch) => updateSong(editingSong.id, patch)}
				/>
			) : null}
		</>
	);
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
			{icon}
			{label}
		</span>
	);
}
