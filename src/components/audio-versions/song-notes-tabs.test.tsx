// @vitest-environment jsdom

import { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeSongNoteTabs } from "#/lib/audio-versions/song-note-tabs";
import {
	createDefaultUiSettings,
	createDefaultWorkspaceState,
	type Song,
	type WorkspaceState,
} from "#/lib/audio-versions/types";
import { SongNotesTabs } from "./song-notes-tabs";
import { useSongWorkspaceHistory } from "./use-song-workspace-history";

let patchSong: (update: (song: Song) => Song) => void;
let patchWorkspace: (update: (state: WorkspaceState) => WorkspaceState) => void;
const provider = {
	settings: { ui: createDefaultUiSettings() },
	updateUiSettings: vi.fn(),
	createNoteTab: vi.fn(),
	updateNoteTab: vi.fn(),
	deleteNoteTab: vi.fn(),
	updateWorkspaceState: vi.fn(),
};
vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => provider,
}));
const initial: Song = {
	id: "song",
	title: "Mix",
	artist: "",
	project: "",
	generalNotes: "Mixing notes",
	audioFileOrder: [],
	createdAt: "today",
	updatedAt: "today",
	noteTabs: [
		{ id: "main", name: "Mixing", content: "Mixing notes" },
		{ id: "record", name: "Recording", content: "Mic placement" },
	],
};
function Harness({ requestedTabId }: { requestedTabId?: string }) {
	const [song, setSong] = useState(initial),
		[workspace, setWorkspace] = useState(createDefaultWorkspaceState());
	patchSong = setSong;
	patchWorkspace = setWorkspace;
	const history = useSongWorkspaceHistory(song.id);
	return (
		<SongNotesTabs
			song={song}
			workspace={workspace}
			history={history}
			requestedTabId={requestedTabId}
			onInternalLink={() => {}}
		/>
	);
}
function currentEditor() {
	const view = EditorView.findFromDOM(
		within(screen.getByRole("tabpanel")).getByRole("textbox", {
			name: "Song notes",
		}),
	);
	if (!view) throw Error("Missing editor");
	return view;
}
beforeEach(() => {
	vi.clearAllMocks();
	provider.settings.ui = createDefaultUiSettings();
	provider.createNoteTab.mockImplementation(async (_songId, name) => {
		const id = crypto.randomUUID();
		patchSong((song) =>
			changeSongNoteTabs(song, (tabs) => [...tabs, { id, name, content: "" }]),
		);
		return id;
	});
	provider.updateNoteTab.mockImplementation(async (_songId, id, patch) => {
		patchSong((song) =>
			changeSongNoteTabs(song, (tabs) =>
				tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
			),
		);
	});
	provider.deleteNoteTab.mockImplementation(async (_songId, id) => {
		patchSong((song) =>
			changeSongNoteTabs(song, (tabs) => tabs.filter((tab) => tab.id !== id)),
		);
	});
	provider.updateWorkspaceState.mockImplementation(async (_songId, update) => {
		patchWorkspace(update);
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
describe("named Song Notes interface", () => {
	it("adjusts note text one pixel at a time and restores the saved size without replacing the editor", () => {
		const { rerender } = render(<Harness />);
		const editor = currentEditor();
		act(() => editor.dispatch({ selection: { anchor: 3 } }));
		expect(
			editor.dom.closest<HTMLElement>(".journal-codemirror")?.style.fontSize,
		).toBe("14px");
		fireEvent.click(
			screen.getByRole("button", { name: "Increase note text size" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Increase note text size" }),
		);
		const increases = provider.updateUiSettings.mock.calls.map(
			([patch]) => patch,
		);
		expect(increases).toHaveLength(2);
		let ui = provider.settings.ui;
		for (const patch of increases) {
			expect(typeof patch).toBe("function");
			ui = patch(ui);
		}
		expect(ui.songNotesFontSize).toBe(16);
		provider.settings.ui = ui;
		rerender(<Harness />);
		expect(currentEditor()).toBe(editor);
		expect(editor.state.selection.main.head).toBe(3);
		expect(
			editor.dom.closest<HTMLElement>(".journal-codemirror")?.style.fontSize,
		).toBe("16px");
		fireEvent.click(
			screen.getByRole("button", { name: "Decrease note text size" }),
		);
		const decrease = provider.updateUiSettings.mock.lastCall?.[0];
		expect(typeof decrease).toBe("function");
		expect(decrease(provider.settings.ui).songNotesFontSize).toBe(15);
	});

	it("creates named tabs and preserves cursor, undo state and unsaved edits across switches", async () => {
		render(<Harness />);
		const mixing = currentEditor();
		act(() =>
			mixing.dispatch({ selection: { anchor: mixing.state.doc.length } }),
		);
		act(() =>
			mixing.dispatch({
				...mixing.state.replaceSelection(" extra"),
				annotations: Transaction.userEvent.of("input.type"),
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "New note tab" }));
		await screen.findByRole("tab", { name: "Untitled 1" });
		expect(provider.createNoteTab).toHaveBeenCalledWith("song", "Untitled 1");
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "New note tab" }));
		await screen.findByRole("tab", { name: "Untitled 2" });
		expect(currentEditor().state.doc.toString()).toBe("");
		fireEvent.click(screen.getByRole("tab", { name: "Mixing" }));
		expect(currentEditor()).toBe(mixing);
		expect(mixing.state.doc.toString()).toBe("Mixing notes extra");
		expect(mixing.state.selection.main.head).toBe(18);
		await waitFor(() =>
			expect(provider.updateNoteTab).toHaveBeenCalledWith("song", "main", {
				content: "Mixing notes extra",
			}),
		);
	});
	it("renames inline without replacing content and cancels with Escape", async () => {
		render(<Harness />);
		expect(
			screen.queryByRole("button", { name: "Note tab actions" }),
		).toBeNull();
		const editor = currentEditor();
		fireEvent.doubleClick(screen.getByRole("tab", { name: "Mixing" }));
		const input = screen.getByRole("textbox", { name: "Tab name" });
		expect(document.activeElement).toBe(input);
		fireEvent.change(input, { target: { value: "Final mix" } });
		fireEvent.keyDown(input, { key: "Enter" });
		await screen.findByRole("tab", { name: "Final mix" });
		expect(currentEditor()).toBe(editor);
		expect(editor.state.doc.toString()).toBe("Mixing notes");
		provider.updateNoteTab.mockClear();
		fireEvent.doubleClick(screen.getByRole("tab", { name: "Final mix" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Tab name" }), {
			target: { value: "Discard this" },
		});
		fireEvent.keyDown(screen.getByRole("textbox", { name: "Tab name" }), {
			key: "Escape",
		});
		expect(screen.getByRole("tab", { name: "Final mix" })).toBeTruthy();
		expect(provider.updateNoteTab).not.toHaveBeenCalled();
	});
	it("shows every saved tab and confirms before deleting its notes", async () => {
		render(<Harness requestedTabId="record" />);
		expect(screen.getByRole("tab", { name: "Mixing" })).toBeTruthy();
		await waitFor(() =>
			expect(currentEditor().state.doc.toString()).toBe("Mic placement"),
		);
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		fireEvent.click(
			screen.getByRole("button", { name: "Delete Recording tab" }),
		);
		expect(confirm).toHaveBeenCalledWith(
			expect.stringContaining("all of its notes"),
		);
		expect(provider.deleteNoteTab).not.toHaveBeenCalled();
		expect(screen.getByRole("tab", { name: "Recording" })).toBeTruthy();
		confirm.mockReturnValue(true);
		fireEvent.click(
			screen.getByRole("button", { name: "Delete Recording tab" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("tab", { name: "Recording" })).toBeNull(),
		);
		expect(provider.deleteNoteTab).toHaveBeenCalledWith("song", "record");
		expect(currentEditor().state.doc.toString()).toBe("Mixing notes");
		expect(
			screen.getByRole<HTMLButtonElement>("button", {
				name: "Delete Mixing tab",
			}).disabled,
		).toBe(true);
	});
	it("cycles open note tabs with command-shift brackets", async () => {
		render(<Harness />);
		expect(screen.getByRole("tab", { name: "Recording" })).toBeTruthy();

		cleanup();
		render(<Harness requestedTabId="record" />);
		await waitFor(() =>
			expect(currentEditor().state.doc.toString()).toBe("Mic placement"),
		);
		const editor = currentEditor();
		act(() => editor.contentDOM.focus());
		const outer = vi.fn();
		window.addEventListener("keydown", outer);
		try {
			fireEvent.keyDown(window, {
				key: "{",
				code: "BracketLeft",
				metaKey: true,
				shiftKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Mixing" })
					.getAttribute("aria-selected"),
			).toBe("true");
			expect(outer).not.toHaveBeenCalled();
			await waitFor(() =>
				expect(document.activeElement).toBe(
					document
						.getElementById("note-panel-main")
						?.querySelector(".cm-content"),
				),
			);
			fireEvent.keyDown(window, {
				key: "]",
				code: "BracketRight",
				metaKey: true,
				shiftKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Recording" })
					.getAttribute("aria-selected"),
			).toBe("true");
			fireEvent.keyDown(window, {
				key: "}",
				code: "BracketRight",
				ctrlKey: true,
				shiftKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Mixing" })
					.getAttribute("aria-selected"),
			).toBe("true");
			fireEvent.keyDown(window, {
				key: "[",
				code: "BracketLeft",
				metaKey: true,
				shiftKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Recording" })
					.getAttribute("aria-selected"),
			).toBe("true");
			fireEvent.keyDown(window, {
				key: "[",
				code: "BracketLeft",
				metaKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Recording" })
					.getAttribute("aria-selected"),
			).toBe("true");
			screen.getByRole("tab", { name: "Recording" }).focus();
			fireEvent.keyDown(window, {
				key: "{",
				code: "BracketLeft",
				metaKey: true,
				shiftKey: true,
			});
			expect(document.activeElement).toBe(
				screen.getByRole("tab", { name: "Mixing" }),
			);
			const dialog = document.createElement("div");
			dialog.setAttribute("role", "dialog");
			dialog.setAttribute("aria-modal", "true");
			document.body.append(dialog);
			fireEvent.keyDown(window, {
				key: "}",
				code: "BracketRight",
				metaKey: true,
				shiftKey: true,
			});
			expect(
				screen
					.getByRole("tab", { name: "Mixing" })
					.getAttribute("aria-selected"),
			).toBe("true");
			dialog.remove();
		} finally {
			window.removeEventListener("keydown", outer);
		}
	});
	it("uses arrow keys to switch tabs without triggering outer playback shortcuts", async () => {
		render(<Harness requestedTabId="record" />);
		await waitFor(() =>
			expect(currentEditor().state.doc.toString()).toBe("Mic placement"),
		);
		const outer = vi.fn();
		window.addEventListener("keydown", outer);
		try {
			fireEvent.keyDown(screen.getByRole("tab", { name: "Recording" }), {
				key: "ArrowLeft",
			});
			expect(
				screen
					.getByRole("tab", { name: "Mixing" })
					.getAttribute("aria-selected"),
			).toBe("true");
			expect(outer).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener("keydown", outer);
		}
	});
});
