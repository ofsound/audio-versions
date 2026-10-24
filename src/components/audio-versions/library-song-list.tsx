import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, FolderClosed, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { Song } from "#/lib/audio-versions/types";

type SortColumn =
	| "title"
	| "artist"
	| "project"
	| "sessions"
	| "files"
	| "markers";

interface LibrarySongListProps {
	songs: Song[];
	showArtist: boolean;
	showProject: boolean;
	fileCounts: Map<string, number>;
	markerCounts: Map<string, number>;
	sessionDates: Map<string, string>;
	sessionSortKeys: Map<string, string>;
	onOpen: (id: string) => void;
	onEdit: (id: string) => void;
}

export function LibrarySongList({
	songs,
	showArtist,
	showProject,
	fileCounts,
	markerCounts,
	sessionDates,
	sessionSortKeys,
	onOpen,
	onEdit,
}: LibrarySongListProps) {
	const navigate = useNavigate();
	const [sort, setSort] = useState<{
		column: SortColumn;
		ascending: boolean;
	} | null>(null);
	const sortedSongs = useMemo(() => {
		if (!sort) return songs;
		const value = (song: Song) => {
			switch (sort.column) {
				case "files":
					return fileCounts.get(song.id) ?? 0;
				case "markers":
					return markerCounts.get(song.id) ?? 0;
				case "sessions":
					return sessionSortKeys.get(song.id) ?? "";
				default:
					return song[sort.column];
			}
		};
		return [...songs].sort((a, b) => {
			const left = value(a);
			const right = value(b);
			const result =
				typeof left === "number" && typeof right === "number"
					? left - right
					: String(left).localeCompare(String(right), undefined, {
							numeric: true,
							sensitivity: "base",
						});
			return sort.ascending ? result : -result;
		});
	}, [songs, sort, fileCounts, markerCounts, sessionSortKeys]);
	const columns: { key: SortColumn; label: string; numeric?: boolean }[] = [
		{ key: "title", label: "Name" },
		...(showArtist ? [{ key: "artist" as const, label: "Artist" }] : []),
		...(showProject ? [{ key: "project" as const, label: "Project" }] : []),
		{ key: "sessions", label: "Session dates" },
		{ key: "files", label: "Files", numeric: true },
		{ key: "markers", label: "Markers", numeric: true },
	];

	return (
		<section
			aria-label="Song list"
			className="max-h-[calc(100dvh-13rem)] overflow-auto border border-[var(--color-border-plain)]"
		>
			<table className="w-full min-w-[42rem] border-collapse text-left text-sm">
				<thead className="sticky top-0 z-10 bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
					<tr>
						{columns.map(({ key, label, numeric }) => (
							<th
								key={key}
								scope="col"
								aria-sort={
									sort?.column === key
										? sort.ascending
											? "ascending"
											: "descending"
										: "none"
								}
								className={`whitespace-nowrap border-b border-[var(--color-border-plain)] px-4 py-3 font-medium ${numeric ? "w-24 text-right" : ""}`}
							>
								<button
									type="button"
									className={`inline-flex items-center gap-2 hover:text-[var(--color-text)] ${numeric ? "justify-end" : ""}`}
									onClick={() =>
										setSort((current) => ({
											column: key,
											ascending:
												current?.column === key ? !current.ascending : true,
										}))
									}
								>
									{label}
									{sort?.column === key ? (
										sort.ascending ? (
											<ArrowUp size={13} />
										) : (
											<ArrowDown size={13} />
										)
									) : null}
								</button>
							</th>
						))}
						<th
							scope="col"
							className="w-14 border-b border-[var(--color-border-plain)]"
						>
							<span className="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{sortedSongs.map((song) => (
						<tr
							key={song.id}
							className="group cursor-pointer border-b border-[var(--color-border-plain)] bg-[var(--color-surface)] text-[var(--color-text)] last:border-b-0 even:bg-[var(--color-surface-elevated)] hover:bg-[var(--color-accent-surface)] focus-within:bg-[var(--color-accent-surface)]"
							onClick={(event) => {
								if ((event.target as HTMLElement).closest("a,button")) return;
								onOpen(song.id);
								void navigate({
									to: "/songs/$songId",
									params: { songId: song.id },
								});
							}}
						>
							<td className="min-w-40 px-4 py-3 font-semibold">
								<Link
									to="/songs/$songId"
									params={{ songId: song.id }}
									aria-label={`Open ${song.title}`}
									onClick={() => onOpen(song.id)}
									className="flex items-center gap-3 no-underline"
								>
									<FolderClosed
										size={17}
										className="shrink-0 text-[var(--color-text-muted)]"
									/>
									<span className="line-clamp-1" title={song.title}>
										{song.title}
									</span>
								</Link>
							</td>
							{showArtist ? (
								<td
									className="max-w-56 truncate px-4 py-3 text-[var(--color-text-muted)]"
									title={song.artist}
								>
									{song.artist || "—"}
								</td>
							) : null}
							{showProject ? (
								<td
									className="max-w-56 truncate px-4 py-3 text-[var(--color-text-muted)]"
									title={song.project}
								>
									{song.project || "—"}
								</td>
							) : null}
							<td className="whitespace-nowrap px-4 py-3 text-[var(--color-text-muted)]">
								{sessionDates.get(song.id) ?? "—"}
							</td>
							<td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
								{fileCounts.get(song.id) ?? 0}
							</td>
							<td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
								{markerCounts.get(song.id) ?? 0}
							</td>
							<td className="px-3 py-2 text-right">
								<button
									type="button"
									onClick={() => onEdit(song.id)}
									className="icon-button icon-button--sm"
									aria-label={`Edit settings for ${song.title}`}
									title="Edit song settings"
								>
									<Settings size={12} />
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
