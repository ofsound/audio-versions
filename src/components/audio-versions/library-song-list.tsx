import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Play, Settings, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	fitLibraryColumnWidths,
	LIBRARY_COLUMNS,
	type LibraryColumnKey,
	type LibraryColumnWidths,
} from "#/lib/audio-versions/library-columns";
import type { AudioFileRecord, Song } from "#/lib/audio-versions/types";
import { useLibraryColumnResize } from "./use-library-column-resize";

type SortColumn = LibraryColumnKey;

interface LibrarySongListProps {
	previewFiles: Map<string, AudioFileRecord>;
	previewFileId?: string;
	onPreview: (file?: AudioFileRecord) => void;
	columnWidths?: LibraryColumnWidths;
	onColumnWidthsChange: (widths: LibraryColumnWidths) => void;
	songs: Song[];
	showArtist: boolean;
	fileCounts: Map<string, number>;
	markerCounts: Map<string, number>;
	sessionDates: Map<string, string>;
	sessionSortKeys: Map<string, string>;
	onOpen: (id: string) => void;
	onEdit: (id: string) => void;
}

export function LibrarySongList({
	previewFiles,
	previewFileId,
	onPreview,
	columnWidths,
	onColumnWidthsChange,
	songs,
	showArtist,
	fileCounts,
	markerCounts,
	sessionDates,
	sessionSortKeys,
	onOpen,
	onEdit,
}: LibrarySongListProps) {
	const navigate = useNavigate();
	const tableRef = useRef<HTMLTableElement>(null);
	const {
		widths: requestedWidths,
		setWidth,
		handleProps,
	} = useLibraryColumnResize(tableRef, columnWidths, onColumnWidthsChange);
	const [availableWidth, setAvailableWidth] = useState(0);
	useEffect(() => {
		const container = tableRef.current?.parentElement;
		if (!container) return;
		const measure = () => setAvailableWidth(container.clientWidth);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);
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
	const keys: LibraryColumnKey[] = [
		"title",
		...(showArtist ? ["artist" as const] : []),
		"sessions",
		"files",
		"markers",
	];
	const widths = fitLibraryColumnWidths(requestedWidths, keys, availableWidth);
	const columns = keys.map((key) => ({ key, ...LIBRARY_COLUMNS[key] }));
	const minimumTableWidth =
		96 +
		keys.reduce(
			(total, key) =>
				total +
				(widths[key] ??
					(key === "title"
						? LIBRARY_COLUMNS.title.minimum
						: LIBRARY_COLUMNS[key].width)),
			0,
		);
	const fitColumn = (key: LibraryColumnKey) => {
		const header = tableRef.current?.querySelector<HTMLElement>(
			`th[data-column-key="${key}"]`,
		);
		if (!header) return;
		const context = document.createElement("canvas").getContext("2d");
		if (!context) {
			setWidth(key, LIBRARY_COLUMNS[key].width);
			return;
		}
		const font = getComputedStyle(header);
		context.font = `${key === "title" ? "600" : "400"} ${font.fontSize} ${font.fontFamily}`;
		const values = songs.map((song) =>
			key === "title"
				? song.title
				: key === "artist"
					? song.artist
					: key === "sessions"
						? (sessionDates.get(song.id) ?? "—")
						: String(
								(key === "files" ? fileCounts : markerCounts).get(song.id) ?? 0,
							),
		);
		const content =
			Math.max(0, ...values.map((value) => context.measureText(value).width)) +
			32;
		setWidth(
			key,
			Math.max(
				content,
				context.measureText(LIBRARY_COLUMNS[key].label).width + 56,
			),
		);
	};

	const rows = useMemo(
		() =>
			sortedSongs.map((song) => (
				<tr
					key={song.id}
					className="group cursor-pointer border-b border-[var(--color-border-plain)] bg-[var(--color-surface)] text-[var(--color-text)] last:border-b-0"
					onClick={(event) => {
						if ((event.target as HTMLElement).closest("a,button")) return;
						onOpen(song.id);
						void navigate({
							to: "/songs/$songId",
							params: { songId: song.id },
						});
					}}
				>
					<td className="overflow-hidden px-4 py-3 font-semibold">
						<Link
							to="/songs/$songId"
							params={{ songId: song.id }}
							aria-label={`Open ${song.title}`}
							onClick={() => onOpen(song.id)}
							className="block min-w-0 no-underline"
						>
							<span
								className="block min-w-0 truncate text-[var(--color-text)]"
								title={song.title}
							>
								{song.title}
							</span>
						</Link>
					</td>
					{showArtist ? (
						<td
							className="truncate px-4 py-3 text-[var(--color-text-muted)]"
							title={song.artist}
						>
							{song.artist || "—"}
						</td>
					) : null}
					<td
						title={sessionDates.get(song.id)}
						className="truncate whitespace-nowrap px-4 py-3 text-[var(--color-text-muted)]"
					>
						{sessionDates.get(song.id) ?? "—"}
					</td>
					<td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
						{fileCounts.get(song.id) ?? 0}
					</td>
					<td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
						{markerCounts.get(song.id) ?? 0}
					</td>
					<td className="px-3 py-2 text-right">
						<div className="flex items-center justify-end gap-1">
							<button
								type="button"
								className="icon-button icon-button--sm"
								disabled={!previewFiles.has(song.id)}
								aria-label={`${previewFiles.get(song.id)?.id === previewFileId && previewFileId ? "Stop" : "Play"} preview for ${song.title}`}
								title={
									previewFiles.get(song.id)?.id === previewFileId &&
									previewFileId
										? "Stop and rewind"
										: (previewFiles.get(song.id)?.title ?? "No audio files")
								}
								onClick={() =>
									onPreview(
										previewFiles.get(song.id)?.id === previewFileId
											? undefined
											: previewFiles.get(song.id),
									)
								}
							>
								{previewFiles.get(song.id)?.id === previewFileId &&
								previewFileId ? (
									<Square size={12} fill="currentColor" />
								) : (
									<Play size={12} fill="currentColor" />
								)}
							</button>
							<button
								type="button"
								onClick={() => onEdit(song.id)}
								className="icon-button icon-button--sm"
								aria-label={`Edit settings for ${song.title}`}
								title="Edit song settings"
							>
								<Settings size={12} />
							</button>
						</div>
					</td>
					<td aria-hidden="true" />
				</tr>
			)),
		[
			previewFiles,
			previewFileId,
			onPreview,
			sortedSongs,
			showArtist,
			sessionDates,
			fileCounts,
			markerCounts,
			onOpen,
			onEdit,
			navigate,
		],
	);

	return (
		<section
			aria-label="Song list"
			className="max-h-[calc(100dvh-13rem)] overflow-auto border border-[var(--color-border-plain)]"
		>
			<table
				ref={tableRef}
				className="w-full table-fixed border-collapse text-left text-sm"
				style={{ minWidth: minimumTableWidth }}
			>
				<colgroup>
					{keys.map((key) => (
						<col
							key={key}
							style={{
								width:
									widths[key] ??
									(key === "title" ? undefined : LIBRARY_COLUMNS[key].width),
							}}
						/>
					))}
					<col style={{ width: 96 }} />
					<col style={{ width: widths.title === undefined ? 0 : undefined }} />
				</colgroup>
				<thead className="sticky top-0 z-10 bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
					<tr>
						{columns.map(({ key, label, numeric }) => (
							<th
								key={key}
								scope="col"
								data-column-key={key}
								aria-sort={
									sort?.column === key
										? sort.ascending
											? "ascending"
											: "descending"
										: "none"
								}
								className={`relative whitespace-nowrap border-b border-[var(--color-border-plain)] px-4 py-3 font-medium ${numeric ? "text-right" : ""}`}
							>
								<button
									type="button"
									className={`inline-flex max-w-full items-center gap-2 overflow-hidden hover:text-[var(--color-text)] ${numeric ? "justify-end" : ""}`}
									onClick={() =>
										setSort((current) => ({
											column: key,
											ascending:
												current?.column === key ? !current.ascending : true,
										}))
									}
								>
									<span className="truncate">{label}</span>
									{sort?.column === key ? (
										sort.ascending ? (
											<ArrowUp size={13} className="shrink-0" />
										) : (
											<ArrowDown size={13} className="shrink-0" />
										)
									) : null}
								</button>
								<button
									type="button"
									aria-label={`Resize ${label} column`}
									title={`Drag to resize ${label}. Double-click to fit contents. Arrow keys adjust width.`}
									className="library-column-resizer"
									{...handleProps(key)}
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
									}}
									onDoubleClick={() => fitColumn(key)}
									onKeyDown={(event) => {
										if (
											event.key !== "ArrowLeft" &&
											event.key !== "ArrowRight" &&
											event.key !== "Home"
										)
											return;
										event.preventDefault();
										event.stopPropagation();
										const width =
											event.currentTarget.closest("th")?.getBoundingClientRect()
												.width ||
											widths[key] ||
											LIBRARY_COLUMNS[key].width;
										setWidth(
											key,
											event.key === "Home"
												? LIBRARY_COLUMNS[key].minimum
												: width +
														(event.key === "ArrowRight" ? 1 : -1) *
															(event.shiftKey ? 32 : 8),
										);
									}}
								>
									<span aria-hidden="true" />
								</button>
							</th>
						))}
						<th
							scope="col"
							className="w-24 border-b border-[var(--color-border-plain)]"
						>
							<span className="sr-only">Actions</span>
						</th>
						<th className="border-b border-[var(--color-border-plain)]" />
					</tr>
				</thead>
				<tbody>{rows}</tbody>
			</table>
		</section>
	);
}
