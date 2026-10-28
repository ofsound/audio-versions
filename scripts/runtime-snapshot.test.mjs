import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRuntimeSnapshot } from "../electron/runtime-snapshot.mjs";

test("running assets survive replacing a build; new launches receive the new build", async () => {
	const root = await mkdtemp(join(tmpdir(), "audio-versions-snapshot-test-"));
	const source = join(root, ".output");
	let first, second;
	try {
		await mkdir(join(source, "server"), { recursive: true });
		await mkdir(join(source, "public", "assets"), { recursive: true });
		await writeFile(join(source, "server", "index.mjs"), "// old server");
		await writeFile(join(source, "public", "assets", "playlists-old.js"), "old playlist");
		first = await createRuntimeSnapshot(source, root);
		await rm(source, { recursive: true });
		await mkdir(join(source, "server"), { recursive: true });
		await writeFile(join(source, "server", "index.mjs"), "// new server");
		assert.equal(await readFile(join(first.entryPath, "../../public/assets/playlists-old.js"), "utf8"), "old playlist");
		assert.equal(await readFile(first.entryPath, "utf8"), "// old server");
		second = await createRuntimeSnapshot(source, root);
		assert.equal(await readFile(second.entryPath, "utf8"), "// new server");
	} finally {
		first?.cleanup(); second?.cleanup();
		await rm(root, { recursive: true, force: true });
	}
});
