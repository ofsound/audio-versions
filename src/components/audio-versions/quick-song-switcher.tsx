import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { SongModal } from "./song-modal";

const MAX_RESULTS = 8;

function normalize(value: string) {
	return value.trim().toLocaleLowerCase();
}

function rankSongs(songs: Song[], recents: string[], query: string) {
	const normalizedQuery = normalize(query);
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const recencyById = new Map(recents.map((id, index) => [id, index]));

	return songs
		.map((song) => {
			const title = normalize(song.title);
			const artist = normalize(song.artist);
			const project = normalize(song.project);
			const searchable = `${title} ${artist} ${project}`;

			if (tokens.some((token) => !searchable.includes(token))) {
				return null;
			}

			const recentIndex = recencyById.get(song.id);
			let score =
				typeof recentIndex === "number"
					? Math.max(0, recents.length - recentIndex)
					: 0;

			if (normalizedQuery) {
				if (title === normalizedQuery) {
					score += 1_000;
				} else if (title.startsWith(normalizedQuery)) {
					score += 500;
				} else if (title.includes(normalizedQuery)) {
					score += 250;
				}

				score += tokens.filter((token) => title.startsWith(token)).length * 50;
				score += tokens.filter((token) => artist.includes(token)).length * 20;
				score += tokens.filter((token) => project.includes(token)).length * 10;
			}

			return { song, score };
		})
		.filter((entry): entry is { song: Song; score: number } => entry !== null)
		.sort(
			(left, right) =>
				right.score - left.score ||
				right.song.updatedAt.localeCompare(left.song.updatedAt),
		)
		.slice(0, MAX_RESULTS)
		.map((entry) => entry.song);
}

export function QuickSongSwitcher() {
	const navigate = useNavigate();
	const { ready, settings, songs } = useAudioVersions();
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const results = useMemo(
		() => rankSongs(songs, settings.recents, query),
		[query, settings.recents, songs],
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				event.key.toLowerCase() === "g"
			) {
				event.preventDefault();
				setIsOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	function close() {
		setIsOpen(false);
		setQuery("");
		setSelectedIndex(0);
	}

	function openSong(song: Song) {
		close();
		void navigate({
			to: "/songs/$songId",
			params: { songId: song.id },
		});
	}

	if (!isOpen) {
		return null;
	}

	return (
		<SongModal
			title="Quick Open"
			titleId="quick-song-switcher-title"
			onClose={close}
			initialFocusRef={inputRef}
		>
			<div className="p-4 sm:p-5">
				<label className="search-shell flex h-12 items-center gap-3 px-4">
					<Search
						size={18}
						className="shrink-0 text-[var(--color-text-muted)]"
					/>
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setSelectedIndex((current) =>
									Math.min(current + 1, results.length - 1),
								);
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setSelectedIndex((current) => Math.max(current - 1, 0));
							} else if (event.key === "Enter" && results[selectedIndex]) {
								event.preventDefault();
								openSong(results[selectedIndex]);
							}
						}}
						placeholder="Search"
						aria-label="Search songs"
						aria-controls="quick-song-results"
						aria-activedescendant={
							results[selectedIndex]
								? `quick-song-${results[selectedIndex].id}`
								: undefined
						}
						className="min-w-0 flex-1 border-0 bg-transparent text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
					/>
					<kbd className="surface-chip hidden px-2 py-1 text-xs text-[var(--color-text-muted)] sm:block">
						esc
					</kbd>
				</label>

				<div
					id="quick-song-results"
					role="listbox"
					aria-label="Songs"
					className="mt-3 flex max-h-[min(24rem,50vh)] flex-col overflow-y-auto"
				>
					{!ready ? (
						<p className="px-3 py-5 text-sm text-[var(--color-text-muted)]">
							Loading songs…
						</p>
					) : results.length === 0 ? (
						<p className="px-3 py-5 text-sm text-[var(--color-text-muted)]">
							No matching songs.
						</p>
					) : (
						results.map((song, index) => {
							const selected = index === selectedIndex;
							const metadata = [song.artist, song.project]
								.filter(Boolean)
								.join(" · ");

							return (
								<button
									id={`quick-song-${song.id}`}
									key={song.id}
									type="button"
									role="option"
									aria-selected={selected}
									onMouseEnter={() => setSelectedIndex(index)}
									onClick={() => openSong(song)}
									className={`flex items-center gap-4 border px-4 py-3 text-left ${
										selected
											? "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)]"
											: "border-transparent"
									}`}
								>
									<span className="min-w-0 flex-1">
										<span className="font-title block truncate text-base font-semibold text-[var(--color-text)]">
											{song.title}
										</span>
										{metadata ? (
											<span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
												{metadata}
											</span>
										) : null}
									</span>
									{selected ? (
										<CornerDownLeft
											size={15}
											className="shrink-0 text-[var(--color-text-muted)]"
										/>
									) : null}
								</button>
							);
						})
					)}
				</div>
			</div>
		</SongModal>
	);
}
