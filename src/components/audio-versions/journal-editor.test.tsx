// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalEditor } from "./journal-editor";
import { captureJournalSelection, readJournal } from "./journal-editor-dom";

afterEach(cleanup);

describe("JournalEditor", () => {
	it("inserts timestamps as atomic, non-editable chips", () => {
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
		const timestampChip = screen.getByLabelText(`Timestamp ${timestamp}`);
		expect(timestampChip.getAttribute("contenteditable")).toBe("false");
		expect(onChange).toHaveBeenLastCalledWith(
			`Alpha {{timestamp:${timestamp}}} Beta`,
		);
		expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Italic" })).toBeNull();
	});

	it("restores persisted timestamp tokens as chips", () => {
		render(
			<JournalEditor
				value="Before {{timestamp:Jul 26, 2026 at 5:30 PM}} after"
				onChange={() => {}}
			/>,
		);

		const chip = screen.getByLabelText("Timestamp Jul 26, 2026 at 5:30 PM");
		expect(chip.textContent).toBe("Jul 26, 2026 at 5:30 PM");
		expect(chip.getAttribute("contenteditable")).toBe("false");
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
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(editor.firstElementChild as HTMLElement);
		range.collapse(false);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
		editor.scrollTop = 320;
		fireEvent.paste(editor, { clipboardData: { getData: () => `\n${href}` } });
		expect(screen.getByRole("textbox", { name: "Song notes" })).toBe(editor);
		expect(editor.scrollTop).toBe(320);
		expect(document.activeElement).toBe(editor);

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
	it("selects timestamps directly and deletes them as undoable units without moving the viewport", () => {
		const onChange = vi.fn();
		const source = "Before {{timestamp:Oct 24, 2026 at 5:30 PM}} after";
		render(<JournalEditor value={source} onChange={onChange} />);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.scrollTop = 440;
		const chip = screen.getByRole("button", {
			name: "Timestamp Oct 24, 2026 at 5:30 PM",
		});
		fireEvent.click(chip);
		expect(chip.dataset.journalSelected).toBe("true");
		expect(window.getSelection()?.containsNode(chip, false)).toBe(true);
		fireEvent.keyDown(editor, { key: "Backspace" });
		expect(onChange).toHaveBeenLastCalledWith("Before  after");
		expect(editor.textContent).toBe("Before  after");
		expect(editor.scrollTop).toBe(440);
		fireEvent.keyDown(editor, { key: "z", metaKey: true });
		expect(readJournal(editor)).toBe(source);
		expect(editor.scrollTop).toBe(440);
		fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });
		expect(editor.textContent).toBe("Before  after");
		expect(screen.getByRole("textbox", { name: "Song notes" })).toBe(editor);
	});

	it("restores the editing caret on undo instead of sending it to the document end", () => {
		render(
			<JournalEditor
				value={"First line\nSecond line\nLast line"}
				onChange={() => {}}
			/>,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.focus();
		const text = editor.firstElementChild?.firstChild as Text;
		const selection = window.getSelection();
		selection?.setBaseAndExtent(text, 5, text, 5);
		editor.scrollTop = 200;
		fireEvent.keyDown(editor, { key: "x" });
		text.insertData(5, "x");
		selection?.setBaseAndExtent(text, 6, text, 6);
		fireEvent.input(editor);
		fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
		expect(readJournal(editor)).toBe("First line\nSecond line\nLast line");
		expect(captureJournalSelection(editor)).toEqual({ anchor: 5, focus: 5 });
		expect(editor.scrollTop).toBe(200);
	});

	it("does not rewrite or save an unfinished IME composition", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<JournalEditor value="Before" onChange={onChange} />,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.focus();
		fireEvent.compositionStart(editor);
		const paragraph = editor.firstElementChild as HTMLElement;
		paragraph.textContent = "Before 日本語";
		fireEvent.input(editor, { isComposing: true });
		rerender(<JournalEditor value="Older cloud text" onChange={onChange} />);
		expect(editor.textContent).toBe("Before 日本語");
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.compositionEnd(editor);
		expect(onChange).toHaveBeenLastCalledWith("Before 日本語");
	});

	it("pastes plain text safely and keeps trailing blank lines", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="Original" onChange={onChange} />);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(editor);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
		fireEvent.paste(editor, {
			clipboardData: { getData: () => "<img src=x>\n\n" },
		});
		expect(onChange).toHaveBeenLastCalledWith("<img src=x>\n\n");
		expect(editor.querySelector("img")).toBeNull();
		fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
		expect(editor.textContent).toBe("Original");
	});
	it("keeps bold formatting around timestamps across saves and undo", () => {
		render(
			<JournalEditor
				value="**Check {{timestamp:Oct 24, 2026 at 5:30 PM}} this transition**"
				onChange={() => {}}
			/>,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		const strong = editor.querySelector("strong");
		expect(strong?.textContent).toBe(
			"Check Oct 24, 2026 at 5:30 PM this transition",
		);
		expect(strong?.querySelector(".journal-timestamp-chip")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Timestamp Oct 24, 2026 at 5:30 PM" }),
		);
		fireEvent.keyDown(editor, { key: "Delete" });
		fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
		expect(editor.querySelector("strong .journal-timestamp-chip")).toBeTruthy();
		expect(editor.textContent).not.toContain("**");
	});
	it("keeps adjacent inline nodes on one line after replacing all text with a paste", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="" onChange={onChange} />);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		editor.textContent = "Before after";
		fireEvent.input(editor);
		editor.focus();
		const text = editor.firstChild as Text;
		window.getSelection()?.setBaseAndExtent(text, 7, text, 7);
		fireEvent.click(screen.getByRole("button", { name: "Insert Timestamp" }));
		expect(readJournal(editor)).not.toContain("\n");
		expect(readJournal(editor)).toMatch(/^Before \{\{timestamp:.+\}\} after$/);
	});
	it("deletes the keyboard-focused timestamp even when another chip was selected", () => {
		render(
			<JournalEditor
				value="{{timestamp:First}} and {{timestamp:Second}}"
				onChange={() => {}}
			/>,
		);
		const first = screen.getByRole("button", { name: "Timestamp First" });
		const second = screen.getByRole("button", { name: "Timestamp Second" });
		fireEvent.click(first);
		second.focus();
		fireEvent.keyDown(second, { key: "Delete" });
		expect(
			screen.getByRole("button", { name: "Timestamp First" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Timestamp Second" }),
		).toBeNull();
	});
	it.each([
		"Backspace",
		"Delete",
	])("removes an adjacent timestamp with %s without selecting it first", (key) => {
		const onChange = vi.fn();
		const value = "Before {{timestamp:Check}} after";
		render(<JournalEditor value={value} onChange={onChange} />);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		const chip = screen.getByRole("button", { name: "Timestamp Check" });
		editor.focus();
		const text = (
			key === "Backspace" ? chip.nextSibling : chip.previousSibling
		) as Text;
		const offset = key === "Backspace" ? 0 : text.length;
		window.getSelection()?.setBaseAndExtent(text, offset, text, offset);
		editor.scrollTop = 300;
		fireEvent.keyDown(editor, { key });
		expect(onChange).toHaveBeenLastCalledWith("Before  after");
		expect(
			screen.queryByRole("button", { name: "Timestamp Check" }),
		).toBeNull();
		expect(editor.scrollTop).toBe(300);
		fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
		expect(readJournal(editor)).toBe(value);
	});

	it("backspaces a standalone timestamp from the empty paragraph below it", () => {
		const onChange = vi.fn();
		render(
			<JournalEditor
				value={"Notes\n**{{timestamp:Check}}**\n"}
				onChange={onChange}
			/>,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		const last = editor.lastElementChild as HTMLElement;
		editor.focus();
		window.getSelection()?.setBaseAndExtent(last, 0, last, 0);
		fireEvent.keyDown(editor, { key: "Backspace" });
		expect(
			screen.queryByRole("button", { name: "Timestamp Check" }),
		).toBeNull();
		expect(onChange).toHaveBeenLastCalledWith("Notes\n\n");
		fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
		expect(editor.querySelector("strong .journal-timestamp-chip")).toBeTruthy();
	});

	it("does not skip ordinary text or delete a timestamp behind the caret", () => {
		render(
			<JournalEditor value="{{timestamp:Check}} text" onChange={() => {}} />,
		);
		const editor = screen.getByRole("textbox", { name: "Song notes" });
		const chip = screen.getByRole("button", { name: "Timestamp Check" });
		const text = chip.nextSibling as Text;
		editor.focus();
		window
			.getSelection()
			?.setBaseAndExtent(text, text.length, text, text.length);
		const event = new KeyboardEvent("keydown", {
			key: "Backspace",
			bubbles: true,
			cancelable: true,
		});
		fireEvent(editor, event);
		expect(event.defaultPrevented).toBe(false);
		expect(screen.getByRole("button", { name: "Timestamp Check" })).toBe(chip);
	});
});
