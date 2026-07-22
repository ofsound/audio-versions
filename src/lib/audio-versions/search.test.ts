import { describe, expect, it } from "vitest";
import { EMPTY_RICH_TEXT } from "./rich-text";
import { searchAudioVersions } from "./search";
import { createDefaultUiSettings } from "./types";

describe("searchAudioVersions", () => {
	it("keeps artist and project searchable while hiding them from labels", () => {
		const results = searchAudioVersions(
			{
				songs: [
					{
						id: "song-1",
						title: "Midnight Choir",
						artist: "Ada",
						project: "LP1",
						generalNotes: EMPTY_RICH_TEXT,
						audioFileOrder: [],
						createdAt: "2026-04-16T00:00:00.000Z",
						updatedAt: "2026-04-16T00:00:00.000Z",
					},
				],
				audioFiles: [],
				annotations: [],
			},
			"Ada",
			{
				...createDefaultUiSettings(),
				showArtist: false,
				showProject: false,
			},
		);

		expect(results[0]?.title).toBe("Midnight Choir");
		expect(results[0]?.subtitle).toBe("Song");
	});
});
