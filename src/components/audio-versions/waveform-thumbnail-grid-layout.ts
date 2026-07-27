import { getWaveformHeightPx } from "#/lib/audio-versions/ui-settings";

type WaveformThumbnailGridDensity =
	| "comfortable"
	| "compact"
	| "dense"
	| "compressed";

interface WaveformThumbnailGridLayout {
	columns: number;
	density: WaveformThumbnailGridDensity;
	gapPx: number;
	rowHeightPx: number;
	rows: number;
}

export function getWaveformThumbnailGridContentHeight({
	gapPx,
	rowHeightPx,
	rows,
}: Pick<
	WaveformThumbnailGridLayout,
	"gapPx" | "rowHeightPx" | "rows"
>): number {
	return rowHeightPx * rows + gapPx * Math.max(0, rows - 1);
}

interface CalculateWaveformThumbnailGridLayoutOptions {
	height: number;
	itemCount: number;
	/** Cap row height so thumbnails never exceed the file-player waveform. */
	maxRowHeightPx?: number;
	width: number;
}

const TARGET_ASPECT_RATIO = 5;
const MIN_COLUMN_WIDTH_PX = 112;
const DEFAULT_MAX_ROW_HEIGHT_PX = getWaveformHeightPx("large");

function getGapPx(itemCount: number) {
	if (itemCount >= 30) {
		return 6;
	}

	if (itemCount >= 18) {
		return 8;
	}

	if (itemCount >= 10) {
		return 12;
	}

	return 16;
}

function getDensity(rowHeightPx: number): WaveformThumbnailGridDensity {
	if (rowHeightPx >= 64) {
		return "comfortable";
	}

	if (rowHeightPx >= 36) {
		return "compact";
	}

	if (rowHeightPx >= 24) {
		return "dense";
	}

	return "compressed";
}

export function calculateWaveformThumbnailGridLayout({
	height,
	itemCount,
	maxRowHeightPx = DEFAULT_MAX_ROW_HEIGHT_PX,
	width,
}: CalculateWaveformThumbnailGridLayoutOptions): WaveformThumbnailGridLayout | null {
	if (height <= 0 || itemCount <= 0 || width <= 0) {
		return null;
	}

	const cappedMaxRowHeightPx = Math.max(1, maxRowHeightPx);
	const gapPx = getGapPx(itemCount);
	const maxColumns = Math.min(
		itemCount,
		Math.max(1, Math.floor((width + gapPx) / (MIN_COLUMN_WIDTH_PX + gapPx))),
	);
	let bestLayout: WaveformThumbnailGridLayout | null = null;

	for (let columns = 1; columns <= maxColumns; columns += 1) {
		const rows = Math.ceil(itemCount / columns);
		const columnWidthPx = (width - gapPx * (columns - 1)) / columns;
		const availableRowHeightPx = (height - gapPx * (rows - 1)) / rows;
		const rowHeightPx = Math.max(
			1,
			Math.min(
				cappedMaxRowHeightPx,
				columnWidthPx / TARGET_ASPECT_RATIO,
				availableRowHeightPx,
			),
		);

		if (
			!bestLayout ||
			rowHeightPx > bestLayout.rowHeightPx + 0.5 ||
			(Math.abs(rowHeightPx - bestLayout.rowHeightPx) <= 0.5 &&
				columns < bestLayout.columns)
		) {
			bestLayout = {
				columns,
				density: getDensity(rowHeightPx),
				gapPx,
				rowHeightPx: Math.floor(rowHeightPx * 2) / 2,
				rows,
			};
		}
	}

	return bestLayout;
}
