import { useEffect, useState } from "react";

type PanelWidths = { left: number; center: number; right: number };
const STORAGE_KEY = "audio-versions-workspace-panel-widths";

export function useWorkspacePanelWidths() {
	const [widths, setWidths] = useState<PanelWidths | null>(null);
	useEffect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			if (
				saved &&
				[saved.left, saved.center, saved.right].every(
					(value) =>
						typeof value === "number" &&
						Number.isFinite(value) &&
						value >= 240 &&
						value <= 4096,
				)
			) {
				setWidths({
					left: saved.left,
					center: saved.center,
					right: saved.right,
				});
			}
		} catch {
			/* Storage may be unavailable. Resizing still works. */
		}
	}, []);
	useEffect(() => {
		if (!widths) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
		} catch {
			/* Keep the live layout if storage is unavailable. */
		}
	}, [widths]);
	return [widths, setWidths] as const;
}
