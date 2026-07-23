// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalEditor } from "./journal-editor";

afterEach(cleanup);

describe("JournalEditor", () => {
	it("uses a plain textarea with timestamp insertion as its only action", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="Alpha Beta" onChange={onChange} />);

		const editor = screen.getByRole("textbox", { name: "Song journal" });
		editor.focus();
		(editor as HTMLTextAreaElement).setSelectionRange(6, 6);

		fireEvent.click(screen.getByRole("button", { name: "Insert time" }));

		const timestamp = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date());
		expect((editor as HTMLTextAreaElement).value).toBe(
			`Alpha ${timestamp} Beta`,
		);
		expect(onChange).toHaveBeenLastCalledWith(`Alpha ${timestamp} Beta`);
		expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Italic" })).toBeNull();
	});

	it("passes multiline text through without a rich-text conversion", () => {
		const onChange = vi.fn();
		render(<JournalEditor value="First line" onChange={onChange} />);

		fireEvent.change(screen.getByRole("textbox", { name: "Song journal" }), {
			target: { value: "First line\n\nSecond line" },
		});

		expect(onChange).toHaveBeenLastCalledWith("First line\n\nSecond line");
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

		expect(onInternalLink).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-2",
			annotationId: "annotation-7",
			timeMs: 54000,
			autoplay: true,
		});
	});
});
