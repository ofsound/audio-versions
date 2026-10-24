import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isEditableElement } from "#/lib/audio-versions/dom";
import { targetToRouteSearch } from "#/lib/audio-versions/links";
import type { SearchResultType } from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { SongModal } from "./song-modal";

function searchResultTypeLabel(type: SearchResultType): string {
	return type === "journal" ? "Song notes" : type;
}

export function GlobalSearch() {
	const navigate = useNavigate();
	const { ready, search } = useAudioVersions();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const dialogInputRef = useRef<HTMLInputElement | null>(null);

	const results = useMemo(() => search(query), [query, search]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				inputRef.current?.focus();
				setOpen(true);
			}

			if (event.key === "/" && !isEditableElement(event.target)) {
				event.preventDefault();
				inputRef.current?.focus();
				setOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	const closeSearch = () => {
		setOpen(false);
		setQuery("");
	};

	return (
		<div className="min-w-0 w-full max-w-[32rem]">
			<label className="search-shell group flex h-12 min-h-12 items-center gap-3 px-4 py-0">
				<Search size={16} className="shrink-0 text-[var(--color-text-muted)]" />
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder="Search songs, song notes, file notes, and markers"
					className="min-h-0 min-w-0 flex-1 self-stretch border-0 bg-transparent py-0 text-sm leading-none text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
				/>
			</label>

			{open &&
				createPortal(
					<SongModal
						title="Search"
						titleId="global-search-title"
						onClose={closeSearch}
						initialFocusRef={dialogInputRef}
					>
						<div className="flex max-h-[min(42rem,calc(100vh-8rem))] min-h-0 flex-col p-5 sm:p-6">
							<label className="search-shell flex h-12 min-h-12 shrink-0 items-center gap-3 px-4 py-0">
								<Search
									size={16}
									className="shrink-0 text-[var(--color-text-muted)]"
								/>
								<input
									ref={dialogInputRef}
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search songs, song notes, file notes, and markers"
									aria-label="Search library"
									className="min-h-0 min-w-0 flex-1 self-stretch border-0 bg-transparent py-0 text-sm leading-none text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
								/>
							</label>

							<div className="flex min-h-0 flex-1 flex-col pt-4">
								<p
									className="mb-2 shrink-0 text-sm text-[var(--color-text-muted)]"
									aria-live="polite"
								>
									{ready && query.trim().length > 0
										? `${results.length} ${results.length === 1 ? "result" : "results"} found`
										: "Enter a search term"}
								</p>
								<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
									{!ready ? (
										<div className="px-4 py-5 text-sm text-[var(--color-text-muted)]">
											Loading local search index...
										</div>
									) : query.trim().length === 0 ? null : results.length ===
										0 ? (
										<div className="px-4 py-5 text-sm text-[var(--color-text-muted)]">
											No local matches yet.
										</div>
									) : (
										<div className="flex flex-col gap-2">
											{results.map((result) => (
												<button
													key={result.id}
													type="button"
													className="flex w-full items-start gap-3 border border-transparent px-3 py-3 text-left hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-elevated)]"
													onClick={() => {
														closeSearch();
														navigate({
															to: "/songs/$songId",
															params: {
																songId: result.target.songId,
															},
															search: targetToRouteSearch(result.target),
														});
													}}
												>
													<span className="surface-chip mt-1 px-2 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
														{searchResultTypeLabel(result.type)}
													</span>
													<span className="min-w-0 flex-1">
														<span className="font-title block text-sm font-semibold text-[var(--color-text)]">
															{result.title}
														</span>
														<span className="block text-xs text-[var(--color-text-muted)]">
															{result.subtitle}
														</span>
														<span className="mt-1 block text-sm leading-6 text-[var(--color-text-muted)]">
															{result.snippet}
														</span>
													</span>
												</button>
											))}
										</div>
									)}
								</div>
							</div>
						</div>
					</SongModal>,
					document.body,
				)}
		</div>
	);
}
