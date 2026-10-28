import { readFileSync, writeFileSync } from "node:fs";

export function restoreWindowState(path, displays) {
	try {
		const saved = JSON.parse(readFileSync(path, "utf8"));
		if (![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite))
			return null;
		const area =
			displays.find(
				({ workArea: a }) =>
					saved.x < a.x + a.width &&
					saved.x + saved.width > a.x &&
					saved.y < a.y + a.height &&
					saved.y + saved.height > a.y,
			)?.workArea ?? displays[0]?.workArea;
		if (!area) return null;
		const width = Math.min(Math.max(1200, saved.width), area.width);
		const height = Math.min(Math.max(800, saved.height), area.height);
		return {
			width,
			height,
			x: Math.max(area.x, Math.min(saved.x, area.x + area.width - width)),
			y: Math.max(area.y, Math.min(saved.y, area.y + area.height - height)),
			maximized: saved.maximized === true,
		};
	} catch {
		return null;
	}
}

export function saveWindowState(path, window) {
	if (window.isDestroyed() || window.isMinimized() || window.isFullScreen())
		return;
	try {
		writeFileSync(
			path,
			JSON.stringify({
				...window.getNormalBounds(),
				maximized: window.isMaximized(),
			}),
		);
	} catch (error) {
		console.warn("[audio-versions] Could not save window bounds", error);
	}
}
