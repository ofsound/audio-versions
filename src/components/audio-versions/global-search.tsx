import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isEditableElement } from "#/lib/audio-versions/dom";
import { targetToRouteSearch } from "#/lib/audio-versions/links";
import { useAudioVersions } from "#/providers/audio-versions-provider";

export function GlobalSearch() {
	const navigate = useNavigate();
	const { ready, search } = useAudioVersions();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const blurTimerRef = useRef<number | null>(null);

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

	useEffect(() => {
		return () => {
			if (blurTimerRef.current) {
				window.clearTimeout(blurTimerRef.current);
			}
		};
	}, []);

	return (
		<div className="relative min-w-0 w-full max-w-[32rem]">
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
					onBlur={() => {
						blurTimerRef.current = window.setTimeout(() => {
							setOpen(false);
						}, 140);
					}}
					placeholder="Search songs, journals, file notes, and markers"
					className="min-h-0 min-w-0 flex-1 self-stretch border-0 bg-transparent py-0 text-sm leading-none text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
				/>
			</label>

			{open && (!ready || query.trim().length > 0) && (
				<div className="search-popover absolute left-0 right-0 top-[calc(100%+0.75rem)] z-40 p-3">
					{!ready ? (
						<div className="px-4 py-5 text-sm text-[var(--color-text-muted)]">
							Loading local search index...
						</div>
					) : results.length === 0 ? (
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
										setOpen(false);
										setQuery("");
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
										{result.type}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-semibold text-[var(--color-text)]">
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
			)}
		</div>
	);
}
