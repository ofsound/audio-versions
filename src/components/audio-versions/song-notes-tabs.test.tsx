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
		expect(provider.updateUiSettings).toHaveBeenLastCalledWith({
			songNotesFontSize: 15,
		});
		provider.settings.ui = { ...provider.settings.ui, songNotesFontSize: 15 };
		rerender(<Harness />);
		expect(currentEditor()).toBe(editor);
		expect(editor.state.selection.main.head).toBe(3);
		expect(
			editor.dom.closest<HTMLElement>(".journal-codemirror")?.style.fontSize,
		).toBe("15px");
		fireEvent.click(
			screen.getByRole("button", { name: "Decrease note text size" }),
		);
		expect(provider.updateUiSettings).toHaveBeenLastCalledWith({
			songNotesFontSize: 14,
		});
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
	it("closes without deleting, reopens saved tabs, and renames without replacing their content", async () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole("button", { name: "Close Mixing tab" }));
		expect(screen.queryByRole("tab", { name: "Mixing" })).toBeNull();
		expect(provider.deleteNoteTab).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Reopen tab" }));
		fireEvent.click(screen.getByRole("button", { name: "Reopen Mixing" }));
		expect(currentEditor().state.doc.toString()).toBe("Mixing notes");
		fireEvent.doubleClick(screen.getByRole("tab", { name: "Mixing" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Tab name" }), {
			target: { value: "Final mix" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save name" }));
		await screen.findByRole("tab", { name: "Final mix" });
		expect(currentEditor().state.doc.toString()).toBe("Mixing notes");
	});
	it("opens the requested closed document and requires confirmation for deletion", async () => {
		render(<Harness requestedTabId="record" />);
		await waitFor(() =>
			expect(currentEditor().state.doc.toString()).toBe("Mic placement"),
		);
		fireEvent.click(screen.getByRole("button", { name: "Note tab actions" }));
		vi.spyOn(window, "confirm").mockReturnValue(false);
		fireEvent.click(screen.getByRole("button", { name: "Delete notes…" }));
		expect(provider.deleteNoteTab).not.toHaveBeenCalled();
		vi.mocked(window.confirm).mockReturnValue(true);
		fireEvent.click(screen.getByRole("button", { name: "Delete notes…" }));
		await waitFor(() =>
			expect(screen.queryByRole("tab", { name: "Recording" })).toBeNull(),
		);
		expect(provider.deleteNoteTab).toHaveBeenCalledWith("song", "record");
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
