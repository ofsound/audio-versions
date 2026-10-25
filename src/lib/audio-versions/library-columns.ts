export const LIBRARY_COLUMNS = {
	title: { label: "Name", minimum: 160, width: 320, numeric: false },
	artist: { label: "Artist", minimum: 100, width: 200, numeric: false },
	sessions: {
		label: "Session dates",
		minimum: 168,
		width: 280,
		numeric: false,
	},
	files: { label: "Files", minimum: 72, width: 88, numeric: true },
	markers: { label: "Markers", minimum: 96, width: 112, numeric: true },
} as const;
export type LibraryColumnKey = keyof typeof LIBRARY_COLUMNS;
export type LibraryColumnWidths = Partial<Record<LibraryColumnKey, number>>;
export function clampLibraryColumnWidth(
	key: LibraryColumnKey,
	width: number,
): number {
	return Math.round(
		Math.max(LIBRARY_COLUMNS[key].minimum, Math.min(4096, width)),
	);
}
export function normalizeLibraryColumnWidths(
	value: unknown,
): LibraryColumnWidths | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const widths: LibraryColumnWidths = {};
	for (const key of Object.keys(LIBRARY_COLUMNS) as LibraryColumnKey[]) {
		const width = (value as Record<string, unknown>)[key];
		if (typeof width === "number" && Number.isFinite(width))
			widths[key] = clampLibraryColumnWidth(key, width);
	}
	return Object.keys(widths).length ? widths : undefined;
}
