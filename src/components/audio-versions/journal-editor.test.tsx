// @vitest-environment jsdom
import { redo, undo } from "@codemirror/commands";
import { EditorSelection, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalEditor } from "./journal-editor";
import { toggleJournalFormat } from "./journal-editor-engine";

afterEach(cleanup);
function editorView() {
	const editor = screen.getByRole("textbox", { name: "Song notes" });
	const view = EditorView.findFromDOM(editor);
	if (!view) throw new Error("Missing CodeMirror view");
	return view;
}
function type(view: EditorView, text: string) {
	act(() =>
		view.dispatch({
			...view.state.replaceSelection(text),
			annotations: Transaction.userEvent.of("input.type"),
		}),
	);
}
describe("Song Notes with CodeMirror", () => {
	it("edits several cursors atomically and undoes/redoes the whole edit", () => {
		const onChange = vi.fn();
		render(<JournalEditor value={"one\ntwo\nthree"} onChange={onChange} />);
		const view = editorView();
		act(() =>
			view.dispatch({
				selection: EditorSelection.create([
					EditorSelection.cursor(0),
					EditorSelection.cursor(4),
					EditorSelection.cursor(8),
				]),
			}),
		);
		type(view, "• ");
		expect(view.state.doc.toString()).toBe("• one\n• two\n• three");
		expect(view.state.selection.ranges).toHaveLength(3);
		expect(onChange).toHaveBeenLastCalledWith("• one\n• two\n• three");
		act(() => undo(view));
		expect(view.state.doc.toString()).toBe("one\ntwo\nthree");
		act(() => redo(view));
		expect(view.state.doc.toString()).toBe("• one\n• two\n• three");
	});
	it("Option-drag creates a column of cursors without retaining an unrelated cursor", () => {
		render(<JournalEditor value={"one\ntwo\ntri\nend"} onChange={() => {}} />);
		const view = editorView();
		vi.spyOn(view, "posAtCoords").mockImplementation(
			(coords) =>
				view.state.doc.line(
					Math.max(1, Math.min(4, Math.floor(coords.y / 20) + 1)),
				).from,
		);
		vi.spyOn(view, "coordsAtPos").mockImplementation((pos) => ({
			left: 0,
			right: 0,
			top: (view.state.doc.lineAt(pos).number - 1) * 20,
			bottom: view.state.doc.lineAt(pos).number * 20,
		}));
		vi.spyOn(view.scrollDOM, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 500, 100),
		);
		act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
		fireEvent.mouseDown(view.contentDOM, {
			altKey: true,
			button: 0,
			buttons: 1,
			clientX: 1,
			clientY: 10,
		});
		fireEvent.mouseMove(document, {
			altKey: true,
			buttons: 1,
			clientX: 1,
			clientY: 50,
		});
		fireEvent.mouseUp(document, {
			altKey: true,
			button: 0,
			clientX: 1,
			clientY: 50,
		});
		expect(view.state.selection.ranges.map((range) => range.head)).toEqual([
			0, 4, 8,
		]);
		type(view, "x");
		expect(view.state.doc.toString()).toBe("xone\nxtwo\nxtri\nend");
	});

	it("replaces column ranges together without affecting other columns", () => {
		render(<JournalEditor value={"mix A\nmix B\nmix C"} onChange={() => {}} />);
		const view = editorView();
		act(() =>
			view.dispatch({
				selection: EditorSelection.create([
					EditorSelection.range(0, 3),
					EditorSelection.range(6, 9),
					EditorSelection.range(12, 15),
				]),
			}),
		);
		type(view, "take");
		expect(view.state.doc.toString()).toBe("take A\ntake B\ntake C");
	});
	it("keeps the editor, selection and viewport when parent values acknowledge or lag behind edits", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<JournalEditor value="Old" onChange={onChange} />,
		);
		const view = editorView();
		view.scrollDOM.scrollTop = 320;
		act(() => view.dispatch({ selection: { anchor: 3 } }));
		type(view, " new");
		rerender(<JournalEditor value="Stale cloud text" onChange={onChange} />);
		expect(editorView()).toBe(view);
		expect(view.state.doc.toString()).toBe("Old new");
		expect(view.state.selection.main.head).toBe(7);
		expect(view.scrollDOM.scrollTop).toBe(320);
		rerender(<JournalEditor value="Old new" onChange={onChange} />);
		rerender(<JournalEditor value="Old new remotely" onChange={onChange} />);
		expect(view.state.doc.toString()).toBe("Old new remotely");
		expect(view.scrollDOM.scrollTop).toBe(320);
	});
	it("inserts an atomic timestamp at each cursor and preserves its stored tokens", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="Alpha Beta" onChange={onChange} />);
		const view = editorView();
		act(() => view.dispatch({ selection: { anchor: 6 } }));
		fireEvent.click(screen.getByRole("button", { name: "Insert Timestamp" }));
		const date = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date());
		expect(view.state.doc.toString()).toBe(`Alpha {{timestamp:${date}}} Beta`);
		expect(
			screen
				.getByRole("button", { name: `Timestamp ${date}` })
				.getAttribute("contenteditable"),
		).toBe("false");
		expect(onChange).toHaveBeenLastCalledWith(view.state.doc.toString());
	});
	it.each([
		"Backspace",
		"Delete",
	])("selects and removes a timestamp with %s, with undo", (key) => {
		const source = "Before {{timestamp:Check}} after";
		render(<JournalEditor value={source} onChange={() => {}} />);
		const view = editorView();
		view.scrollDOM.scrollTop = 300;
		fireEvent.click(screen.getByRole("button", { name: "Timestamp Check" }));
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe("{{timestamp:Check}}");
		fireEvent.keyDown(view.contentDOM, { key });
		expect(view.state.doc.toString()).toBe("Before  after");
		expect(view.scrollDOM.scrollTop).toBe(300);
		act(() => undo(view));
		expect(view.state.doc.toString()).toBe(source);
	});
	it.each([
		"Backspace",
		"Delete",
	])("removes an adjacent timestamp using %s", (key) => {
		const source = "Before {{timestamp:Check}} after";
		render(<JournalEditor value={source} onChange={() => {}} />);
		const view = editorView();
		act(() =>
			view.dispatch({
				selection: {
					anchor: key === "Backspace" ? source.indexOf(" after") : 7,
				},
			}),
		);
		fireEvent.keyDown(view.contentDOM, { key });
		expect(view.state.doc.toString()).toBe("Before  after");
	});
	it("backspaces a standalone bold timestamp from the blank line below", () => {
		const source = "Notes\n**{{timestamp:Check}}**\n";
		render(<JournalEditor value={source} onChange={() => {}} />);
		const view = editorView();
		act(() => view.dispatch({ selection: { anchor: source.length } }));
		fireEvent.keyDown(view.contentDOM, { key: "Backspace" });
		expect(view.state.doc.toString()).toBe("Notes\n\n");
		act(() => undo(view));
		expect(
			screen.getByRole("button", { name: "Timestamp Check" }),
		).toBeTruthy();
	});
	it("keeps bold and italic styling without changing the plain-text representation", () => {
		const source =
			"**Check {{timestamp:Check}} transition**\n\n_Final thought_";
		const onChange = vi.fn();
		const { container } = render(
			<JournalEditor value={source} onChange={onChange} />,
		);
		expect(container.querySelector("strong")?.textContent).toContain("Check");
		expect(container.querySelector("em")?.textContent).toBe("Final thought");
		expect(editorView().state.doc.toString()).toBe(source);
		expect(onChange).not.toHaveBeenCalled();
	});
	it("applies bold to multiple ranges and restores them in one undo", () => {
		render(<JournalEditor value="one two" onChange={() => {}} />);
		const view = editorView();
		act(() =>
			view.dispatch({
				selection: EditorSelection.create([
					EditorSelection.range(0, 3),
					EditorSelection.range(4, 7),
				]),
			}),
		);
		act(() => toggleJournalFormat(view, "**"));
		expect(view.state.doc.toString()).toBe("**one** **two**");
		act(() => undo(view));
		expect(view.state.doc.toString()).toBe("one two");
	});
	it("opens a persisted labelled marker link and preserves the original source", () => {
		const href =
			"http://localhost:3000/songs/song-1?fileId=file-2&annotationId=a&timeMs=54000&autoplay=1";
		const source = `Mix B\n${href}`;
		const onInternalLink = vi.fn();
		render(
			<JournalEditor
				value={source}
				onChange={() => {}}
				onInternalLink={onInternalLink}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Jump to Mix B" }));
		expect(onInternalLink).toHaveBeenCalledWith(
			expect.objectContaining({
				songId: "song-1",
				fileId: "file-2",
				annotationId: "a",
				timeMs: 54000,
				autoplay: true,
			}),
		);
		expect(editorView().state.doc.toString()).toBe(source);
	});
	it("does not interpret pasted HTML as markup and preserves trailing blank lines", () => {
		render(<JournalEditor value="" onChange={() => {}} />);
		const view = editorView();
		type(view, "<img src=x>\n\n");
		expect(view.state.doc.toString()).toBe("<img src=x>\n\n");
		expect(view.contentDOM.querySelector("img")).toBeNull();
	});
	it("accepts explicit workspace history without echoing a new history entry", () => {
		const onChange = vi.fn(),
			onHistoryChange = vi.fn();
		const { rerender } = render(
			<JournalEditor
				value="Start"
				onChange={onChange}
				onHistoryChange={onHistoryChange}
			/>,
		);
		const view = editorView();
		type(view, "Next");
		const before = onHistoryChange.mock.calls.length;
		rerender(
			<JournalEditor
				value="Start"
				onChange={onChange}
				onHistoryChange={onHistoryChange}
				historyValue={{ revision: 1, value: "Start", action: "undo" }}
			/>,
		);
		expect(view.state.doc.toString()).toBe("Start");
		expect(onHistoryChange.mock.calls).toHaveLength(before);
	});
	it("holds IME edits through stale props and saves the completed composition", async () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<JournalEditor value="Before" onChange={onChange} />,
		);
		const view = editorView();
		fireEvent.compositionStart(view.contentDOM);
		act(() =>
			view.dispatch({
				changes: { from: 6, insert: " 日本語" },
				annotations: Transaction.userEvent.of("input.type.compose"),
			}),
		);
		rerender(<JournalEditor value="Older cloud text" onChange={onChange} />);
		expect(view.state.doc.toString()).toBe("Before 日本語");
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.compositionEnd(view.contentDOM);
		await waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith("Before 日本語"),
		);
	});
	it.each([
		"Backspace",
		"Delete",
	])("edits bold text through hidden delimiters with %s", (key) => {
		render(<JournalEditor value="**bold**" onChange={() => {}} />);
		const view = editorView();
		act(() =>
			view.dispatch({ selection: { anchor: key === "Backspace" ? 8 : 0 } }),
		);
		fireEvent.keyDown(view.contentDOM, { key });
		expect(view.state.doc.toString()).toBe(
			key === "Backspace" ? "**bol**" : "**old**",
		);
		act(() => undo(view));
		expect(view.state.doc.toString()).toBe("**bold**");
	});
	it("toggles whole-note bold back off and deletes empty formatting without stray stars", () => {
		render(<JournalEditor value="**bold**" onChange={() => {}} />);
		const view = editorView();
		act(() => view.dispatch({ selection: { anchor: 0, head: 8 } }));
		act(() => toggleJournalFormat(view, "**"));
		expect(view.state.doc.toString()).toBe("bold");
		act(() =>
			view.dispatch({
				changes: { from: 0, to: 4, insert: "" },
				selection: { anchor: 0 },
			}),
		);
		act(() => toggleJournalFormat(view, "**"));
		fireEvent.keyDown(view.contentDOM, { key: "Backspace" });
		expect(view.state.doc.toString()).toBe("");
	});
});
