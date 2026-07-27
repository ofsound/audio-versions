// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { act, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plainTextToRichText } from "#/lib/audio-versions/rich-text";
import type { RichTextDoc } from "#/lib/audio-versions/types";
import { RichTextEditor } from "./rich-text-editor";

function installClientRectMocks() {
	const rangePrototype = Range.prototype as Range & {
		getBoundingClientRect?: () => DOMRect;
		getClientRects?: () => DOMRect[];
	};
	const textPrototype = Text.prototype as Text & {
		getBoundingClientRect?: () => DOMRect;
		getClientRects?: () => DOMRect[];
	};

	if (!rangePrototype.getClientRects) {
		Object.defineProperty(Range.prototype, "getClientRects", {
			value: () => [new DOMRect(0, 0, 0, 0)],
		});
	}

	if (!rangePrototype.getBoundingClientRect) {
		Object.defineProperty(Range.prototype, "getBoundingClientRect", {
			value: () => new DOMRect(0, 0, 0, 0),
		});
	}

	if (!textPrototype.getClientRects) {
		Object.defineProperty(Text.prototype, "getClientRects", {
			value: () => [new DOMRect(0, 0, 0, 0)],
		});
	}

	if (!textPrototype.getBoundingClientRect) {
		Object.defineProperty(Text.prototype, "getBoundingClientRect", {
			value: () => new DOMRect(0, 0, 0, 0),
		});
	}
}

function buildLinkedDoc(label: string, href: string): RichTextDoc {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: label,
						marks: [{ type: "link", attrs: { href } }],
					},
				],
			},
		],
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

installClientRectMocks();

describe("RichTextEditor", () => {
	it("focuses the editor and reports when requested", async () => {
		const onFocusHandled = vi.fn();
		const { container } = render(
			<RichTextEditor
				value={plainTextToRichText("")}
				onChange={() => {}}
				requestFocus
				onFocusHandled={onFocusHandled}
			/>,
		);

		await waitFor(() => {
			expect(document.activeElement).toBe(
				container.querySelector(".ProseMirror[contenteditable='true']"),
			);
			expect(onFocusHandled).toHaveBeenCalledOnce();
		});
	});

	it("opens internal Audio Versions links in-app instead of a new tab", async () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const onInternalLink = vi.fn();
		const href =
			"/songs/song-1?fileId=file-1&annotationId=annotation-1&timeMs=54000&autoplay=1";

		render(
			<RichTextEditor
				value={buildLinkedDoc("Marker shortcut", href)}
				onChange={() => {}}
				onInternalLink={onInternalLink}
			/>,
		);

		fireEvent.click(
			await screen.findByRole("link", { name: "Marker shortcut" }),
		);

		expect(onInternalLink).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-1",
			annotationId: "annotation-1",
			timeMs: 54000,
			autoplay: true,
		});
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("opens external links in a new tab", async () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const onInternalLink = vi.fn();
		const href = "https://example.com/docs";

		render(
			<RichTextEditor
				value={buildLinkedDoc("External docs", href)}
				onChange={() => {}}
				onInternalLink={onInternalLink}
			/>,
		);

		fireEvent.click(await screen.findByRole("link", { name: "External docs" }));

		expect(onInternalLink).not.toHaveBeenCalled();
		expect(openSpy).toHaveBeenCalledWith(
			"https://example.com/docs",
			"_blank",
			"noopener,noreferrer",
		);
	});

	it("treats absolute Audio Versions URLs as internal links", async () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const onInternalLink = vi.fn();
		const href =
			"http://localhost:3000/songs/song-1?fileId=file-1&annotationId=annotation-1&timeMs=54000&autoplay=1";

		render(
			<RichTextEditor
				value={buildLinkedDoc("Absolute marker", href)}
				onChange={() => {}}
				onInternalLink={onInternalLink}
			/>,
		);

		fireEvent.click(
			await screen.findByRole("link", { name: "Absolute marker" }),
		);

		expect(onInternalLink).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-1",
			annotationId: "annotation-1",
			timeMs: 54000,
			autoplay: true,
		});
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("does not clobber typed characters when the parent commits a stale value via an outer debounce", async () => {
		// Regression: in real usage the parent debounces persistence with its
		// own timer (e.g. 700ms), so there is a window where the editor has
		// accepted more keystrokes than the parent's value prop reflects. When
		// the outer debounce then fires and the parent re-renders with that
		// older value, the editor must not overwrite itself with the stale
		// document -- we should keep the user's newest characters.
		function OuterDebounceHarness() {
			const [value, setValue] = useState<RichTextDoc>(plainTextToRichText(""));
			const latestRef = useRef<RichTextDoc | null>(null);
			const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
			// Match the real app: parents commonly pass an inline arrow function,
			// so onChange is a fresh reference on every render.
			return (
				<RichTextEditor
					value={value}
					onChange={(next) => {
						latestRef.current = next;
						if (timerRef.current) {
							clearTimeout(timerRef.current);
						}
						timerRef.current = setTimeout(() => {
							if (latestRef.current) {
								setValue(latestRef.current);
							}
						}, 150);
					}}
					commitDelayMs={30}
				/>
			);
		}

		const { container } = render(<OuterDebounceHarness />);
		const prose = (await waitFor(() =>
			container.querySelector(".ProseMirror[contenteditable='true']"),
		)) as HTMLElement;

		prose.focus();

		// First burst: "ab". Wait for the inner debounce (30ms) to fire so the
		// parent schedules its outer commit with "ab".
		act(() => {
			prose.innerHTML = "<p>ab</p>";
			prose.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Second burst: "abcde", immediately after the inner debounce fired but
		// before the outer 150ms debounce commits. At this point lastEmitted is
		// "ab" but the editor holds "abcde".
		act(() => {
			prose.innerHTML = "<p>abcde</p>";
			prose.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});

		// Let the outer debounce fire with the stale "ab" value and the parent
		// re-render. The editor must retain "abcde".
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(prose.textContent).toBe("abcde");
	});

	it("does not clobber typed characters when the parent rerenders with its previously committed value", async () => {
		function RerenderBeforeCommitHarness() {
			const [value, setValue] = useState<RichTextDoc>(plainTextToRichText(""));
			const [tick, setTick] = useState(0);
			const latestRef = useRef<RichTextDoc | null>(null);
			const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

			return (
				<>
					<RichTextEditor
						value={value}
						onChange={(next) => {
							latestRef.current = next;
							if (timerRef.current) {
								clearTimeout(timerRef.current);
							}
							timerRef.current = setTimeout(() => {
								if (latestRef.current) {
									setValue(latestRef.current);
								}
							}, 150);
						}}
						commitDelayMs={30}
					/>
					<button
						type="button"
						onClick={() => setTick((current) => current + 1)}
					>
						Rerender {tick}
					</button>
				</>
			);
		}

		const { container } = render(<RerenderBeforeCommitHarness />);
		const prose = (await waitFor(() =>
			container.querySelector(".ProseMirror[contenteditable='true']"),
		)) as HTMLElement;

		prose.focus();

		act(() => {
			prose.innerHTML = "<p>ab</p>";
			prose.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});

		// Let the first outer debounce commit so the parent prop catches up to "ab".
		await new Promise((resolve) => setTimeout(resolve, 220));

		expect(prose.textContent).toBe("ab");

		// Type ahead again so the editor now holds "abcde" while the parent prop
		// still reflects the previously committed "ab" document.
		act(() => {
			prose.innerHTML = "<p>abcde</p>";
			prose.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});

		await new Promise((resolve) => setTimeout(resolve, 60));

		fireEvent.click(screen.getByRole("button", { name: /Rerender 0/i }));

		expect(prose.textContent).toBe("abcde");
	});

	it("does not restore deleted text when the parent echoes an older document later", async () => {
		const staleValue = plainTextToRichText("abcdef");

		function StaleEchoHarness() {
			const [value, setValue] = useState<RichTextDoc>(
				plainTextToRichText("abcdef"),
			);

			return (
				<RichTextEditor
					value={value}
					onChange={(next) => {
						setTimeout(() => {
							setValue(staleValue);
						}, 150);
						setValue(next);
					}}
					commitDelayMs={30}
				/>
			);
		}

		const { container } = render(<StaleEchoHarness />);
		const prose = (await waitFor(() =>
			container.querySelector(".ProseMirror[contenteditable='true']"),
		)) as HTMLElement;

		prose.focus();

		act(() => {
			prose.innerHTML = "<p>abcd</p>";
			prose.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});

		await new Promise((resolve) => setTimeout(resolve, 260));

		expect(prose.textContent).toBe("abcd");
	});

	it("blurs the editor when Escape is pressed and blurOnEscape is enabled", async () => {
		const { container } = render(
			<RichTextEditor
				value={plainTextToRichText("Note")}
				onChange={() => {}}
				blurOnEscape
				showToolbar={false}
				compact
				dense
			/>,
		);

		const prose = await waitFor(() =>
			container.querySelector(".ProseMirror[contenteditable='true']"),
		);
		expect(prose).toBeTruthy();
		(prose as HTMLElement).focus();
		expect(document.activeElement).toBe(prose);

		fireEvent.keyDown(prose as HTMLElement, { key: "Escape" });

		expect(document.activeElement).not.toBe(prose);
	});
});
