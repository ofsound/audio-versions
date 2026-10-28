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

/** Fit stored widths to the viewport while reserving the row's action buttons. */
export function fitLibraryColumnWidths(
	widths: LibraryColumnWidths,
	keys: LibraryColumnKey[],
	availableWidth: number,
): LibraryColumnWidths {
	if (availableWidth <= 0) return widths;
	const requested = (key: LibraryColumnKey) =>
		widths[key] ??
		(key === "title"
			? LIBRARY_COLUMNS.title.minimum
			: LIBRARY_COLUMNS[key].width);
	const total = keys.reduce((sum, key) => sum + requested(key), 0);
	const available = availableWidth - 96;
	if (total <= available) return widths;
	const minimum = keys.reduce(
		(sum, key) => sum + LIBRARY_COLUMNS[key].minimum,
		0,
	);
	const scale = Math.max(0, (available - minimum) / (total - minimum || 1));
	return Object.fromEntries(
		keys.map((key) => [
			key,
			LIBRARY_COLUMNS[key].minimum +
				(requested(key) - LIBRARY_COLUMNS[key].minimum) * scale,
		]),
	);
}
