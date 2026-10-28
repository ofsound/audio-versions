// @vitest-environment jsdom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
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

	it.each([
		"Escape",
		"close button",
		"backdrop",
	])("stays closed after %s restores focus to the search field", async (method) => {
		render(<GlobalSearch />);
		const trigger = screen.getByPlaceholderText(
			"Search songs, song notes, file notes, and markers",
		);
		act(() => trigger.focus());
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(trigger);
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("textbox", { name: "Search library" }),
			),
		);
		if (method === "Escape")
			fireEvent.keyDown(
				screen.getByRole("textbox", { name: "Search library" }),
				{ key: "Escape" },
			);
		else
			fireEvent.click(
				screen.getByRole("button", {
					name: method === "close button" ? "Close search" : "Dismiss search",
				}),
			);
		expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
		expect(document.activeElement).toBe(trigger);
		fireEvent.click(trigger);
		expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
	});

	it("can reopen with the shortcut after closing and restoring focus", async () => {
		render(<GlobalSearch />);
		const trigger = screen.getByPlaceholderText(
			"Search songs, song notes, file notes, and markers",
		);
		act(() => trigger.focus());
		fireEvent.keyDown(window, { key: "k", metaKey: true });
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("textbox", { name: "Search library" }),
			),
		);
		fireEvent.click(screen.getByRole("button", { name: "Close search" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
	});

	it("shows matching results in a scrollable modal with a result count", () => {
		render(<GlobalSearch />);

		fireEvent.click(
			screen.getByPlaceholderText(
				"Search songs, song notes, file notes, and markers",
			),
		);

		const dialog = screen.getByRole("dialog", { name: "Search" });
		expect(dialog.closest(".song-modal")?.parentElement).toBe(document.body);
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
