import { describe, expect, it } from "vitest";
import { formatAudioFileSessionDateRange } from "./dates";

describe("formatAudioFileSessionDateRange", () => {
	it("returns null when there are no dated files", () => {
		expect(formatAudioFileSessionDateRange([])).toBeNull();
		expect(
			formatAudioFileSessionDateRange([{ sessionDate: "not-a-date" }]),
		).toBeNull();
	});

	it("returns a single date when all files share one session date", () => {
		expect(
			formatAudioFileSessionDateRange([
				{ sessionDate: "2026-04-16" },
				{ sessionDate: "2026-04-16" },
			]),
		).toBe(
			new Date(2026, 3, 16).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
		);
	});

	it("returns an inclusive range across the earliest and latest dates", () => {
		const earliest = new Date(2026, 3, 16).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
		const latest = new Date(2026, 5, 2).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});

		expect(
			formatAudioFileSessionDateRange([
				{ sessionDate: "2026-06-02" },
				{ sessionDate: "2026-04-16" },
				{ sessionDate: "2026-05-01" },
			]),
		).toBe(`${earliest} – ${latest}`);
	});
});
