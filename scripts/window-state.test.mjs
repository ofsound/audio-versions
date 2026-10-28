import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { restoreWindowState, saveWindowState } from "../electron/window-state.mjs";

test("restores window size and maximization, recovering an offscreen window", () => {
	const dir = mkdtempSync(join(tmpdir(), "audio-versions-window-"));
	const path = join(dir, "state.json");
	const displays = [{ workArea: { x: 0, y: 25, width: 1920, height: 1055 } }];
	try {
		assert.equal(restoreWindowState(path, displays), null);
		saveWindowState(path, {
			isDestroyed: () => false, isMinimized: () => false, isFullScreen: () => false,
			isMaximized: () => true,
			getNormalBounds: () => ({ x: 120, y: 80, width: 1400, height: 900 }),
		});
		assert.deepEqual(restoreWindowState(path, displays), { x: 120, y: 80, width: 1400, height: 900, maximized: true });
		writeFileSync(path, JSON.stringify({ x: 3000, y: 500, width: 2000, height: 1200 }));
		assert.deepEqual(restoreWindowState(path, displays), { x: 0, y: 25, width: 1920, height: 1055, maximized: false });
		writeFileSync(path, "broken json");
		assert.equal(restoreWindowState(path, displays), null);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
