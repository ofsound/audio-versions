import {
	ChevronDown,
	ChevronUp,
	GripVertical,
	ListMusic,
	Pause,
	Play,
	Plus,
	Repeat,
	Repeat1,
	SkipBack,
	SkipForward,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { formatDuration } from "#/lib/audio-versions/waveform";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useAudioSource } from "./use-audio-source";

type LoopMode = "off" | "all" | "one";

export function PlaylistsView() {
	const {
		addAudioFileToPlaylist,
		audioFiles,
		blobsByAudioId,
		createPlaylist,
		deletePlaylist,
		getSongById,
		playback,
		playlists,
		registerAudioElement,
		removeAudioFileFromPlaylist,
		reorderPlaylists,
		reportPlaybackState,
		seekFile,
		setPlaylistAudioFileIds,
		togglePlayback,
		updatePlaylist,
	} = useAudioVersions();
	const orderedPlaylists = useMemo(
		() =>
			[...playlists].sort(
				(left, right) =>
					left.sortOrder - right.sortOrder ||
					left.createdAt.localeCompare(right.createdAt),
			),
		[playlists],
	);
	const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>();
	const [activeFileId, setActiveFileId] = useState<string>();
	const [newPlaylistName, setNewPlaylistName] = useState("");
	const [playlistNameDraft, setPlaylistNameDraft] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [loopMode, setLoopMode] = useState<LoopMode>("off");
	const [autoplayFileId, setAutoplayFileId] = useState<string>();
	const [draggedPlaylistId, setDraggedPlaylistId] = useState<string>();
	const [draggedFileId, setDraggedFileId] = useState<string>();
	const selectedPlaylist = orderedPlaylists.find(
		(playlist) => playlist.id === selectedPlaylistId,
	);
	const filesById = useMemo(
		() => new Map(audioFiles.map((audioFile) => [audioFile.id, audioFile])),
		[audioFiles],
	);
	const playlistFiles = useMemo(
		() =>
			(selectedPlaylist?.audioFileIds ?? [])
				.map((id) => filesById.get(id))
				.filter((file): file is AudioFileRecord => Boolean(file)),
		[filesById, selectedPlaylist?.audioFileIds],
	);
	const activeFile = playlistFiles.find((file) => file.id === activeFileId);
	const currentTimeMs = activeFile
		? (playback.currentTimeByFileId[activeFile.id] ?? 0)
		: 0;

	useEffect(() => {
		if (
			selectedPlaylistId &&
			playlists.some((playlist) => playlist.id === selectedPlaylistId)
		) {
			return;
		}
		setSelectedPlaylistId(orderedPlaylists[0]?.id);
	}, [orderedPlaylists, playlists, selectedPlaylistId]);

	useEffect(() => {
		setPlaylistNameDraft(selectedPlaylist?.name ?? "");
		setSearchQuery("");
		setActiveFileId((current) =>
			current && selectedPlaylist?.audioFileIds.includes(current)
				? current
				: selectedPlaylist?.audioFileIds[0],
		);
	}, [selectedPlaylist?.audioFileIds, selectedPlaylist?.name]);

	const searchResults = useMemo(() => {
		const query = searchQuery.trim().toLocaleLowerCase();
		if (!query) {
			return [];
		}
		const existing = new Set(selectedPlaylist?.audioFileIds ?? []);
		return audioFiles
			.filter((file) => !existing.has(file.id))
			.map((file) => {
				const song = getSongById(file.songId);
				const haystack = [file.title, song?.title, song?.artist, song?.project]
					.filter(Boolean)
					.join(" ")
					.toLocaleLowerCase();
				return {
					file,
					song,
					score: haystack.startsWith(query) ? 0 : haystack.indexOf(query),
				};
			})
			.filter((result) => result.score >= 0)
			.sort(
				(left, right) =>
					left.score - right.score ||
					left.file.title.localeCompare(right.file.title),
			)
			.slice(0, 12);
	}, [audioFiles, getSongById, searchQuery, selectedPlaylist?.audioFileIds]);

	async function handleCreatePlaylist(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!newPlaylistName.trim()) {
			return;
		}
		const playlist = await createPlaylist({ name: newPlaylistName });
		setNewPlaylistName("");
		setSelectedPlaylistId(playlist.id);
	}

	async function savePlaylistName() {
		if (!selectedPlaylist) {
			return;
		}
		const name = playlistNameDraft.trim();
		if (!name) {
			setPlaylistNameDraft(selectedPlaylist.name);
			return;
		}
		if (name !== selectedPlaylist.name) {
			await updatePlaylist(selectedPlaylist.id, { name });
		}
	}

	function movePlaylist(playlistId: string, delta: number) {
		const index = orderedPlaylists.findIndex(
			(playlist) => playlist.id === playlistId,
		);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= orderedPlaylists.length) {
			return;
		}
		const ids = orderedPlaylists.map((playlist) => playlist.id);
		[ids[index], ids[target]] = [ids[target], ids[index]];
		void reorderPlaylists(ids);
	}

	function moveFile(fileId: string, delta: number) {
		if (!selectedPlaylist) {
			return;
		}
		const ids = [...selectedPlaylist.audioFileIds];
		const index = ids.indexOf(fileId);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= ids.length) {
			return;
		}
		[ids[index], ids[target]] = [ids[target], ids[index]];
		void setPlaylistAudioFileIds(selectedPlaylist.id, ids);
	}

	function dropPlaylist(targetId: string) {
		if (!draggedPlaylistId || draggedPlaylistId === targetId) {
			return;
		}
		const ids = orderedPlaylists.map((playlist) => playlist.id);
		const sourceIndex = ids.indexOf(draggedPlaylistId);
		const targetIndex = ids.indexOf(targetId);
		ids.splice(targetIndex, 0, ...ids.splice(sourceIndex, 1));
		setDraggedPlaylistId(undefined);
		void reorderPlaylists(ids);
	}

	function dropFile(targetId: string) {
		if (!selectedPlaylist || !draggedFileId || draggedFileId === targetId) {
			return;
		}
		const ids = [...selectedPlaylist.audioFileIds];
		const sourceIndex = ids.indexOf(draggedFileId);
		const targetIndex = ids.indexOf(targetId);
		ids.splice(targetIndex, 0, ...ids.splice(sourceIndex, 1));
		setDraggedFileId(undefined);
		void setPlaylistAudioFileIds(selectedPlaylist.id, ids);
	}

	function playFile(fileId: string) {
		if (fileId === activeFileId) {
			void togglePlayback(fileId);
			return;
		}
		setAutoplayFileId(fileId);
		setActiveFileId(fileId);
	}

	function playAdjacent(direction: -1 | 1, forcePlay = true) {
		if (playlistFiles.length === 0) {
			return;
		}
		const currentIndex = Math.max(
			0,
			playlistFiles.findIndex((file) => file.id === activeFileId),
		);
		let targetIndex = currentIndex + direction;
		if (targetIndex < 0 || targetIndex >= playlistFiles.length) {
			if (loopMode !== "all") {
				return;
			}
			targetIndex = targetIndex < 0 ? playlistFiles.length - 1 : 0;
		}
		const targetId = playlistFiles[targetIndex]?.id;
		if (targetId) {
			if (forcePlay) {
				setAutoplayFileId(targetId);
			}
			setActiveFileId(targetId);
		}
	}

	function handleEnded() {
		if (!activeFile) {
			return;
		}
		if (loopMode === "one") {
			void seekFile(activeFile.id, 0, true);
			return;
		}
		playAdjacent(1, true);
	}

	async function handleDeleteSelectedPlaylist() {
		if (
			!selectedPlaylist ||
			!window.confirm(`Delete “${selectedPlaylist.name}”?`)
		) {
			return;
		}
		await deletePlaylist(selectedPlaylist.id);
	}

	return (
		<main className="mx-auto grid w-full max-w-[1500px] gap-4 px-3 py-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
			<aside className="panel-shell panel-shell--plain flex flex-col overflow-hidden lg:min-h-72">
				<div className="flex items-center gap-2 border-b border-[var(--color-border-plain)] px-4 py-4">
					<ListMusic size={19} className="text-[var(--color-accent)]" />
					<h1 className="font-title text-xl font-semibold">Playlists</h1>
				</div>
				<form
					onSubmit={(event) => void handleCreatePlaylist(event)}
					className="flex gap-2 border-b border-[var(--color-border-plain)] p-3"
				>
					<input
						value={newPlaylistName}
						onChange={(event) => setNewPlaylistName(event.target.value)}
						placeholder="New playlist"
						aria-label="New playlist name"
						maxLength={200}
						className="min-w-0 flex-1 border border-[var(--color-border-plain)] bg-[var(--color-surface-inset)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
					/>
					<button
						type="submit"
						disabled={!newPlaylistName.trim()}
						className="icon-button disabled:opacity-50"
						aria-label="Create playlist"
					>
						<Plus size={16} />
					</button>
				</form>
				<ul className="min-h-0 flex-1 overflow-y-auto p-2">
					{orderedPlaylists.length === 0 ? (
						<li className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
							Create a playlist to start building a listening sequence.
						</li>
					) : (
						orderedPlaylists.map((playlist, index) => (
							<li
								key={playlist.id}
								draggable
								onDragStart={() => setDraggedPlaylistId(playlist.id)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={() => dropPlaylist(playlist.id)}
								className={`group flex items-center gap-1 border px-2 py-2 ${selectedPlaylistId === playlist.id ? "border-[var(--color-accent)] bg-[var(--color-surface-inset)]" : "border-transparent hover:bg-[var(--color-surface-inset)]"}`}
							>
								<GripVertical
									size={14}
									className="cursor-grab text-[var(--color-text-muted)]"
								/>
								<button
									type="button"
									onClick={() => setSelectedPlaylistId(playlist.id)}
									className="min-w-0 flex-1 text-left"
								>
									<span className="block truncate text-sm font-medium">
										{playlist.name}
									</span>
									<span className="text-xs text-[var(--color-text-muted)]">
										{playlist.audioFileIds.length}{" "}
										{playlist.audioFileIds.length === 1 ? "file" : "files"}
									</span>
								</button>
								<div className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
									<button
										type="button"
										disabled={index === 0}
										onClick={() => movePlaylist(playlist.id, -1)}
										className="icon-button icon-button--sm disabled:opacity-25"
										aria-label={`Move ${playlist.name} up`}
									>
										<ChevronUp size={12} />
									</button>
									<button
										type="button"
										disabled={index === orderedPlaylists.length - 1}
										onClick={() => movePlaylist(playlist.id, 1)}
										className="icon-button icon-button--sm disabled:opacity-25"
										aria-label={`Move ${playlist.name} down`}
									>
										<ChevronDown size={12} />
									</button>
								</div>
							</li>
						))
					)}
				</ul>
			</aside>

			<section className="panel-shell panel-shell--plain min-w-0 overflow-hidden">
				{selectedPlaylist ? (
					<div className="flex min-h-[70dvh] flex-col">
						<div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border-plain)] p-4 sm:p-6">
							<form
								onSubmit={(event) => {
									event.preventDefault();
									void savePlaylistName();
								}}
								className="min-w-[12rem] flex-1"
							>
								<input
									value={playlistNameDraft}
									onChange={(event) => setPlaylistNameDraft(event.target.value)}
									onBlur={() => void savePlaylistName()}
									maxLength={200}
									aria-label="Playlist name"
									className="font-title w-full border-b border-transparent bg-transparent text-2xl font-semibold outline-none hover:border-[var(--color-border-plain)] focus:border-[var(--color-accent)]"
								/>
							</form>
							<button
								type="button"
								onClick={() => void handleDeleteSelectedPlaylist()}
								className="icon-button text-[var(--color-danger)]"
								aria-label="Delete playlist"
								title="Delete playlist"
							>
								<Trash2 size={16} />
							</button>
						</div>

						<PlaylistTransport
							activeFile={activeFile}
							currentTimeMs={currentTimeMs}
							isPlaying={Boolean(
								activeFile &&
									playback.activeFileId === activeFile.id &&
									playback.isPlaying,
							)}
							loopMode={loopMode}
							onLoopModeChange={() =>
								setLoopMode((current) =>
									current === "off" ? "all" : current === "all" ? "one" : "off",
								)
							}
							onNext={() => playAdjacent(1)}
							onPlayPause={() =>
								activeFile
									? playFile(activeFile.id)
									: playlistFiles[0] && playFile(playlistFiles[0].id)
							}
							onPrevious={() =>
								currentTimeMs > 3000 && activeFile
									? void seekFile(activeFile.id, 0, playback.isPlaying)
									: playAdjacent(-1)
							}
							onSeek={(timeMs) =>
								activeFile &&
								void seekFile(activeFile.id, timeMs, playback.isPlaying)
							}
						/>

						<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
							<div className="min-w-0 overflow-x-auto border-b border-[var(--color-border-plain)] lg:border-r lg:border-b-0">
								{playlistFiles.length === 0 ? (
									<div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-[var(--color-text-muted)]">
										Search your library to add the first file.
									</div>
								) : (
									<ol className="min-w-[36rem]">
										{playlistFiles.map((file, index) => {
											const song = getSongById(file.songId);
											const isActive = file.id === activeFileId;
											return (
												<li
													key={file.id}
													draggable
													onDragStart={() => setDraggedFileId(file.id)}
													onDragOver={(event) => event.preventDefault()}
													onDrop={() => dropFile(file.id)}
													className={`group grid grid-cols-[2rem_2rem_minmax(0,1fr)_minmax(8rem,0.55fr)_5rem_5rem] items-center border-b border-[var(--color-border-plain)] px-3 py-2 text-sm ${isActive ? "bg-[var(--color-surface-inset)]" : "hover:bg-[var(--color-surface-inset)]"}`}
												>
													<span className="tabular-nums text-[var(--color-text-muted)]">
														{index + 1}
													</span>
													<button
														type="button"
														onClick={() => playFile(file.id)}
														className="icon-button icon-button--sm"
														aria-label={`${isActive && playback.isPlaying ? "Pause" : "Play"} ${file.title}`}
													>
														{isActive && playback.isPlaying ? (
															<Pause size={12} />
														) : (
															<Play size={12} />
														)}
													</button>
													<button
														type="button"
														onClick={() => setActiveFileId(file.id)}
														className="min-w-0 text-left"
													>
														<span className="block truncate font-medium">
															{file.title}
														</span>
														<span className="block truncate text-xs text-[var(--color-text-muted)]">
															{song?.title ?? "Unknown song"}
														</span>
													</button>
													<span className="truncate text-[var(--color-text-muted)]">
														{song?.artist || song?.project || "—"}
													</span>
													<span className="tabular-nums text-[var(--color-text-muted)]">
														{formatDuration(file.durationMs)}
													</span>
													<span className="flex items-center justify-end">
														<GripVertical
															size={14}
															className="cursor-grab text-[var(--color-text-muted)]"
														/>
														<button
															type="button"
															onClick={() =>
																void removeAudioFileFromPlaylist(
																	selectedPlaylist.id,
																	file.id,
																)
															}
															className="icon-button icon-button--sm"
															aria-label={`Remove ${file.title} from playlist`}
														>
															<X size={12} />
														</button>
													</span>
													<span className="sr-only">
														<button
															type="button"
															disabled={index === 0}
															onClick={() => moveFile(file.id, -1)}
														>
															Move up
														</button>
														<button
															type="button"
															disabled={index === playlistFiles.length - 1}
															onClick={() => moveFile(file.id, 1)}
														>
															Move down
														</button>
													</span>
												</li>
											);
										})}
									</ol>
								)}
							</div>
							<aside className="flex min-h-72 flex-col p-4">
								<label
									htmlFor="playlist-file-search"
									className="mb-2 text-sm font-semibold"
								>
									Add files
								</label>
								<input
									id="playlist-file-search"
									type="search"
									value={searchQuery}
									onChange={(event) => setSearchQuery(event.target.value)}
									placeholder="Search files, songs, artists…"
									autoComplete="off"
									className="border border-[var(--color-border-plain)] bg-[var(--color-surface-inset)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
								/>
								<div
									aria-live="polite"
									className="mt-3 min-h-0 flex-1 overflow-y-auto"
								>
									{searchQuery.trim() && searchResults.length === 0 ? (
										<p className="px-2 py-4 text-sm text-[var(--color-text-muted)]">
											No matching files outside this playlist.
										</p>
									) : (
										searchResults.map(({ file, song }) => (
											<button
												key={file.id}
												type="button"
												onClick={() =>
													void addAudioFileToPlaylist(
														selectedPlaylist.id,
														file.id,
													)
												}
												className="flex w-full items-center gap-3 border-b border-[var(--color-border-plain)] px-2 py-3 text-left hover:bg-[var(--color-surface-inset)]"
											>
												<Plus
													size={14}
													className="shrink-0 text-[var(--color-accent)]"
												/>
												<span className="min-w-0">
													<span className="block truncate text-sm font-medium">
														{file.title}
													</span>
													<span className="block truncate text-xs text-[var(--color-text-muted)]">
														{song?.title ?? "Unknown song"}
														{song?.artist ? ` · ${song.artist}` : ""}
													</span>
												</span>
											</button>
										))
									)}
								</div>
							</aside>
						</div>
						{activeFile ? (
							<PlaylistAudio
								audioFile={activeFile}
								blob={blobsByAudioId[activeFile.id]}
								autoplay={autoplayFileId === activeFile.id}
								registerAudioElement={registerAudioElement}
								reportPlaybackState={reportPlaybackState}
								seekFile={seekFile}
								onAutoplayConsumed={() => setAutoplayFileId(undefined)}
								onEnded={handleEnded}
							/>
						) : null}
					</div>
				) : (
					<div className="flex min-h-[70dvh] items-center justify-center px-8 text-center text-[var(--color-text-muted)]">
						<div>
							<ListMusic size={32} className="mx-auto mb-4" />
							<p>Create a playlist to organize files across songs.</p>
						</div>
					</div>
				)}
			</section>
		</main>
	);
}

function PlaylistTransport({
	activeFile,
	currentTimeMs,
	isPlaying,
	loopMode,
	onLoopModeChange,
	onNext,
	onPlayPause,
	onPrevious,
	onSeek,
}: {
	activeFile?: AudioFileRecord;
	currentTimeMs: number;
	isPlaying: boolean;
	loopMode: LoopMode;
	onLoopModeChange: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	onSeek: (timeMs: number) => void;
}) {
	const LoopIcon = loopMode === "one" ? Repeat1 : Repeat;
	return (
		<div className="grid gap-3 border-b border-[var(--color-border-plain)] bg-[var(--color-surface-inset)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
			<div className="min-w-0">
				<p className="truncate text-sm font-semibold">
					{activeFile?.title ?? "Nothing queued"}
				</p>
				<div className="mt-2 flex items-center gap-3">
					<span className="w-10 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
						{formatDuration(currentTimeMs)}
					</span>
					<input
						type="range"
						min={0}
						max={Math.max(1, activeFile?.durationMs ?? 1)}
						value={Math.min(currentTimeMs, activeFile?.durationMs ?? 0)}
						onChange={(event) => onSeek(Number(event.target.value))}
						disabled={!activeFile}
						className="min-w-0 flex-1 accent-[var(--color-accent)]"
						aria-label="Playlist playhead"
					/>
					<span className="w-10 text-xs tabular-nums text-[var(--color-text-muted)]">
						{formatDuration(activeFile?.durationMs ?? 0)}
					</span>
				</div>
			</div>
			<div className="flex items-center justify-center gap-2">
				<button
					type="button"
					onClick={onPrevious}
					disabled={!activeFile}
					className="icon-button disabled:opacity-35"
					aria-label="Previous file"
				>
					<SkipBack size={17} />
				</button>
				<button
					type="button"
					onClick={onPlayPause}
					disabled={!activeFile}
					className="action-primary flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-35"
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? <Pause size={18} /> : <Play size={18} />}
				</button>
				<button
					type="button"
					onClick={onNext}
					disabled={!activeFile}
					className="icon-button disabled:opacity-35"
					aria-label="Next file"
				>
					<SkipForward size={17} />
				</button>
				<button
					type="button"
					onClick={onLoopModeChange}
					className={`icon-button ${loopMode === "off" ? "text-[var(--color-text-muted)]" : "text-[var(--color-accent)]"}`}
					aria-label={`Loop ${loopMode}`}
					title={`Loop: ${loopMode}`}
				>
					<LoopIcon size={17} />
				</button>
			</div>
		</div>
	);
}

function PlaylistAudio({
	audioFile,
	blob,
	autoplay,
	registerAudioElement,
	reportPlaybackState,
	seekFile,
	onAutoplayConsumed,
	onEnded,
}: {
	audioFile: AudioFileRecord;
	blob?: Blob;
	autoplay: boolean;
	registerAudioElement: (
		fileId: string,
		element: HTMLAudioElement | null,
	) => void;
	reportPlaybackState: (
		fileId: string,
		patch: { isPlaying?: boolean; currentTimeMs?: number },
	) => void;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	onAutoplayConsumed: () => void;
	onEnded: () => void;
}) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const source = useAudioSource(
		audioFile.id,
		blob,
		audioFile.remoteMedia,
		audioRef,
	);
	useEffect(() => {
		registerAudioElement(audioFile.id, audioRef.current);
		return () => registerAudioElement(audioFile.id, null);
	}, [audioFile.id, registerAudioElement]);
	return (
		/* biome-ignore lint/a11y/useMediaCaption: hidden transport audio is controlled through the playlist UI */
		<audio
			ref={audioRef}
			src={source ?? undefined}
			preload="metadata"
			className="hidden"
			onLoadedMetadata={() => {
				if (autoplay) {
					onAutoplayConsumed();
					void seekFile(audioFile.id, 0, true);
				}
			}}
			onPlay={(event) =>
				reportPlaybackState(audioFile.id, {
					isPlaying: true,
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onPause={(event) =>
				reportPlaybackState(audioFile.id, {
					isPlaying: false,
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onTimeUpdate={(event) =>
				reportPlaybackState(audioFile.id, {
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onEnded={() => {
				reportPlaybackState(audioFile.id, {
					isPlaying: false,
					currentTimeMs: audioFile.durationMs,
				});
				onEnded();
			}}
		/>
	);
}
