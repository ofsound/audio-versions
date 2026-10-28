import { describe, expect, it } from "vitest";
import { getSongPreviewFile } from "./song-preview";
import type { AudioFileRecord, Song } from "./types";

const song = { id: "song", starredAudioFileId: "older" } as Song;
const files = [
	{ id: "newer", songId: "song", createdAt: "2026-10-27" },
	{ id: "older", songId: "song", createdAt: "2026-10-20" },
	{ id: "other", songId: "other-song", createdAt: "2026-10-28" },
] as AudioFileRecord[];

describe("song index previews", () => {
	it("prefers the star over import order and newer files", () => {
		expect(getSongPreviewFile(song, files)?.id).toBe("older");
	});
	it("uses newest import when unstarred or the star was deleted", () => {
		for (const starredAudioFileId of [null, undefined, "deleted", "other"]) {
			expect(
				getSongPreviewFile({ ...song, starredAudioFileId }, files)?.id,
			).toBe("newer");
		}
	});
	it("has no preview for an empty song", () => {
		expect(getSongPreviewFile(song, [])).toBeUndefined();
	});
});
