// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "#/lib/audio-versions/types";
import { GlobalSearch } from "./global-search";

const navigateMock = vi.fn();
const results: SearchResult[] = Array.from({ length: 12 }, (_, index) => ({
	id: `file-${index}`,
	type: "file",
	title: `High Plains Drifter v${index + 1}`,
	subtitle: "High Plains Drifter",
	snippet: "Open file notes",
	target: { songId: "song-1", fileId: `file-${index}` },
	score: 10,
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready: true,
		search: (query: string) => (query.trim() ? results : []),
	}),
}));

describe("GlobalSearch", () => {
	afterEach(() => {
		cleanup();
		navigateMock.mockClear();
	});

	it("shows matching results in a scrollable modal with a result count", () => {
		render(<GlobalSearch />);

		fireEvent.focus(
			screen.getByPlaceholderText(
				"Search songs, song notes, file notes, and markers",
			),
		);

		const dialog = screen.getByRole("dialog", { name: "Search" });
		fireEvent.change(
			within(dialog).getByRole("textbox", { name: "Search library" }),
			{
				target: { value: "drift" },
			},
		);

		expect(within(dialog).getByText("12 results found")).toBeTruthy();
		expect(within(dialog).getByText("High Plains Drifter v12")).toBeTruthy();
		expect(
			within(dialog).getByText("High Plains Drifter v12").closest("div")
				?.parentElement?.className,
		).toContain("overflow-y-auto");
	});
});
