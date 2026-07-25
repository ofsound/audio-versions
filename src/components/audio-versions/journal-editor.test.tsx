// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalEditor } from "./journal-editor";

afterEach(cleanup);

describe("JournalEditor", () => {
	it("uses a plain-text editor with timestamp insertion as its only action", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="Alpha Beta" onChange={onChange} />);

		expect(screen.getByText("Song Notes")).toBeTruthy();
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.focus();
		const text = editor.firstElementChild?.firstChild;
		const selection = window.getSelection();
		const range = document.createRange();
		range.setStart(text as Text, 6);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);

		fireEvent.click(screen.getByRole("button", { name: "Insert Timestamp" }));

		const timestamp = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date());
		expect(editor.textContent).toBe(`Alpha ${timestamp} Beta`);
		expect(onChange).toHaveBeenLastCalledWith(`Alpha ${timestamp} Beta`);
		expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Italic" })).toBeNull();
	});

	it("passes multiline text through without a rich-text conversion", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="First line" onChange={onChange} />);

		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.innerHTML =
			"<div>First line</div><div><br></div><div>Second line</div>";
		fireEvent.input(editor);

		expect(onChange).toHaveBeenLastCalledWith("First line\n\nSecond line");
	});

	it("preserves blank paragraphs and common inline formatting on reload", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<JournalEditor value="First line" onChange={onChange} />,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.innerHTML =
			"<div>First line</div><div><br></div><div><b>Timestamp</b></div><div><br></div><div><i>Final thought</i></div>";
		fireEvent.input(editor);

		const persistedValue = "First line\n\n**Timestamp**\n\n_Final thought_";
		expect(onChange).toHaveBeenLastCalledWith(persistedValue);

		rerender(
			<JournalEditor
				value={persistedValue}
				onChange={onChange}
				historyValue={{ revision: 1, value: persistedValue }}
			/>,
		);
		const reloadedEditor = screen.getByRole("textbox", {
			name: "Song notes",
		});
		expect(reloadedEditor.querySelector("strong")?.textContent).toBe(
			"Timestamp",
		);
		expect(reloadedEditor.querySelector("em")?.textContent).toBe(
			"Final thought",
		);
		expect(reloadedEditor.querySelectorAll("div")).toHaveLength(5);
		expect(reloadedEditor.querySelectorAll("div > br")).toHaveLength(2);
	});

	it("turns pasted marker URLs into cross-file jump controls", () => {
		const onInternalLink = vi.fn();
		render(
			<JournalEditor
				value={[
					"Mix B - Marker 0:54",
					"http://localhost:3000/songs/song-1?fileId=file-2&annotationId=annotation-7&timeMs=54000&autoplay=1",
				].join("\n")}
				onChange={() => {}}
				onInternalLink={onInternalLink}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: "Jump to Mix B - Marker 0:54",
			}),
		);
		expect(
			screen.queryByText(
				"http://localhost:3000/songs/song-1?fileId=file-2&annotationId=annotation-7&timeMs=54000&autoplay=1",
			),
		).toBeNull();
		expect(screen.getByText("0:54")).toBeTruthy();

		expect(onInternalLink).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-2",
			annotationId: "annotation-7",
			timeMs: 54000,
			autoplay: true,
		});
	});

	it("converts a newly pasted marker URL into an inline chip", () => {
		const href =
			"http://localhost:3000/songs/song-1?fileId=file-2&annotationId=annotation-7&timeMs=54000&autoplay=1";
		const onChange = vi.fn();
		render(<JournalEditor value="Existing note" onChange={onChange} />);

		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.innerHTML = `<div>Existing note</div><div>${href}</div>`;
		fireEvent.input(editor);

		expect(
			screen.getByRole("button", { name: "Jump to Existing note" }),
		).toBeTruthy();
		expect(screen.queryByText(href)).toBeNull();
	});

	it("supports keyboard undo and redo for journal edits", () => {
		const onChange = vi.fn();
		const onLocalHistoryAction = vi.fn();
		render(
			<JournalEditor
				value="Original"
				onChange={onChange}
				onLocalHistoryAction={onLocalHistoryAction}
			/>,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });

		editor.textContent = "Changed";
		fireEvent.input(editor);
		fireEvent.keyDown(editor, { key: "z", metaKey: true });
		expect(onChange).toHaveBeenLastCalledWith("Original");
		expect(onLocalHistoryAction).toHaveBeenLastCalledWith("undo");

		fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });
		expect(onChange).toHaveBeenLastCalledWith("Changed");
		expect(onLocalHistoryAction).toHaveBeenLastCalledWith("redo");
	});
});
