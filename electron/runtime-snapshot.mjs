import { rmSync } from "node:fs";
import { access, cp, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

/** Keep server code and hashed public assets together for the whole app session. */
export async function createRuntimeSnapshot(
	outputDirectory,
	temporaryDirectory,
) {
	const directory = await mkdtemp(
		join(temporaryDirectory, "audio-versions-runtime-"),
	);
	const cleanup = () => rmSync(directory, { recursive: true, force: true });
	try {
		await cp(outputDirectory, directory, {
			recursive: true,
			dereference: true,
		});
		const entryPath = join(directory, "server", "index.mjs");
		await access(entryPath);
		return { entryPath, cleanup };
	} catch (error) {
		cleanup();
		throw error;
	}
}
