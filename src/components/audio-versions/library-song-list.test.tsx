// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeLibraryColumnWidths } from "#/lib/audio-versions/library-columns";
import type { Song } from "#/lib/audio-versions/types";
import { LibrarySongList } from "./library-song-list";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href="/" {...props}>
			{children}
		</a>
	),
	useNavigate: () => vi.fn(),
}));
const change = vi.fn();
const songs = [
	{ id: "b", title: "Zulu", artist: "Artist" },
	{ id: "a", title: "Alpha", artist: "Artist" },
] as Song[];
function view() {
	return render(
		<LibrarySongList
			previewFiles={new Map()}
			onPreview={vi.fn()}
			songs={songs}
			showArtist={false}
			columnWidths={{ artist: 220 }}
			onColumnWidthsChange={change}
			fileCounts={new Map()}
			markerCounts={new Map()}
			sessionDates={new Map()}
			sessionSortKeys={new Map()}
			onOpen={vi.fn()}
			onEdit={vi.fn()}
		/>,
	);
}
describe("library column resizing", () => {
	beforeEach(() => {
		change.mockClear();
		class Pointer extends MouseEvent {
			pointerId = 1;
		}
		vi.stubGlobal("PointerEvent", Pointer);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			function (this: HTMLElement) {
				return {
					width: this.dataset.columnKey === "title" ? 400 : 200,
				} as DOMRect;
			},
		);
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
	it("previews drag without saving until release, retaining hidden columns and sort order", () => {
		const { container } = view();
		const handle = screen.getByRole("button", { name: "Resize Name column" });
		fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
		fireEvent.pointerMove(handle, { clientX: 500 });
		expect(container.querySelector("col")?.style.width).toBe("500px");
		expect(change).not.toHaveBeenCalled();
		fireEvent.pointerUp(handle, { clientX: 500 });
		expect(change).toHaveBeenCalledOnce();
		expect(change.mock.calls[0][0]).toMatchObject({ title: 500, artist: 220 });
		expect(document.body.style.cursor).toBe("");
		expect(screen.getAllByRole("link").map((el) => el.textContent)).toEqual([
			"Zulu",
			"Alpha",
		]);
		fireEvent.click(screen.getByRole("button", { name: /^Name$/ }));
		expect(screen.getAllByRole("link").map((el) => el.textContent)).toEqual([
			"Alpha",
			"Zulu",
		]);
	});
	it("cancels a drag and restores selection behavior", () => {
		const { container } = view();
		const handle = screen.getByRole("button", { name: "Resize Name column" });
		fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
		fireEvent.pointerMove(handle, { clientX: 100 });
		expect(container.querySelector("col")?.style.width).toBe("160px");
		fireEvent.pointerCancel(handle);
		expect(change).not.toHaveBeenCalled();
		expect(container.querySelector("col")?.style.width).toBe("");
		expect(document.body.style.userSelect).toBe("");
	});
	it("supports keyboard resizing and commits the last position on window blur", () => {
		view();
		const handle = screen.getByRole("button", { name: "Resize Name column" });
		fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
		expect(change.mock.calls[0][0].title).toBe(432);
		fireEvent.keyDown(handle, { key: "Home" });
		expect(change.mock.calls[1][0].title).toBe(160);
		fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
		fireEvent.pointerMove(handle, { clientX: 450 });
		fireEvent.blur(window);
		expect(change.mock.calls[2][0].title).toBe(450);
		expect(document.body.style.cursor).toBe("");
	});
	it("normalizes stored widths and ignores malformed preferences", () => {
		expect(
			normalizeLibraryColumnWidths({
				title: 1,
				files: Infinity,
				markers: 9000,
				artist: "100",
				unknown: 200,
			}),
		).toEqual({ title: 160, markers: 4096 });
		expect(normalizeLibraryColumnWidths([])).toBeUndefined();
	});
});
