import { Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import { getSongNoteTabs } from "#/lib/audio-versions/song-note-tabs";
import type {
	Song,
	SongLinkTarget,
	SongNoteTab,
	WorkspaceState,
} from "#/lib/audio-versions/types";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { JournalEditor } from "./journal-editor";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";
import type { useSongWorkspaceHistory } from "./use-song-workspace-history";

type WorkspaceHistory = ReturnType<typeof useSongWorkspaceHistory>;

/** Cmd/Ctrl-Shift-[ and ] — shifted keys report "{" and "}" in the browser. */
function noteTabCycleDirection(event: KeyboardEvent): -1 | 1 | null {
	if (
		event.altKey ||
		event.isComposing ||
		!(event.metaKey || event.ctrlKey) ||
		!event.shiftKey
	)
		return null;
	if (event.code === "BracketLeft" || event.key === "[" || event.key === "{")
		return -1;
	if (event.code === "BracketRight" || event.key === "]" || event.key === "}")
		return 1;
	return null;
}

function NoteDocument({
	songId,
	tab,
	visible,
	history,
	onActivate,
	onInternalLink,
	fontSize,
	onFontSizeChange,
}: {
	fontSize: number;
	onFontSizeChange: (delta: number) => void;
	songId: string;
	tab: SongNoteTab;
	visible: boolean;
	history: WorkspaceHistory;
	onActivate: (id: string) => void;
	onInternalLink: (target: SongLinkTarget) => void;
}) {
	const { updateNoteTab } = useAudioVersions();
	const [historyValue, setHistoryValue] = useState<{
		revision: number;
		value: string;
		action: "undo" | "redo";
	}>();
	const revision = useRef(0);
	const persist = useDebouncedAsyncCallback({
		callback: (value: string) =>
			updateNoteTab(songId, tab.id, { content: value }),
		delayMs: DEBOUNCE_MS.journal,
	});
	useEffect(() => {
		if (!visible) void persist.flush();
	}, [visible, persist]);
	useEffect(
		() => () => {
			void persist.flush();
		},
		[persist],
	);
	return (
		<JournalEditor
			fontSize={fontSize}
			onFontSizeChange={onFontSizeChange}
			value={tab.content}
			visible={visible}
			showHeading={false}
			historyValue={historyValue}
			onChange={persist.schedule}
			onInternalLink={onInternalLink}
			onLocalHistoryAction={history.acceptLocalHistoryAction}
			onHistoryChange={(previous, next, group) => {
				const apply = async (value: string, action: "undo" | "redo") => {
					persist.cancel();
					onActivate(tab.id);
					setHistoryValue({ revision: ++revision.current, value, action });
					await updateNoteTab(songId, tab.id, { content: value });
				};
				history.record({
					mergeKey: `journal:${songId}:${tab.id}:${group}`,
					undo: () => apply(previous, "undo"),
					redo: () => apply(next, "redo"),
				});
			}}
		/>
	);
}

export function SongNotesTabs({
	song,
	workspace,
	history,
	requestedTabId,
	onTabChange,
	onInternalLink,
}: {
	song: Song;
	workspace: WorkspaceState;
	history: WorkspaceHistory;
	requestedTabId?: string;
	onTabChange?: (id: string | null) => void;
	onInternalLink: (target: SongLinkTarget) => void;
}) {
	const {
		createNoteTab,
		updateNoteTab,
		deleteNoteTab,
		updateWorkspaceState,
		settings,
		updateUiSettings,
	} = useAudioVersions();
	const tabs = getSongNoteTabs(song);
	const initial = workspace.noteTabs ?? {
		openIds: [tabs[0].id],
		activeId: tabs[0].id,
	};
	const [local, setLocal] = useState(initial);
	const validIds = new Set(tabs.map((tab) => tab.id));
	const openIds = [
		...local.openIds.filter((id) => validIds.has(id)),
		...tabs
			.filter((tab) => !local.openIds.includes(tab.id))
			.map((tab) => tab.id),
	];
	const activeId =
		local.activeId && openIds.includes(local.activeId)
			? local.activeId
			: (openIds.at(-1) ?? null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const shell = useRef<HTMLDivElement>(null);
	const tabList = useRef<HTMLDivElement>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	useLayoutEffect(() => {
		if (!activeId || !tabList.current) return;
		const tab = document.getElementById(`note-tab-${activeId}`)?.parentElement;
		if (!tab) return;
		const bounds = tabList.current.getBoundingClientRect(),
			selected = tab.getBoundingClientRect();
		if (selected.right > bounds.right)
			tabList.current.scrollLeft += selected.right - bounds.right + 8;
		else if (selected.left < bounds.left)
			tabList.current.scrollLeft -= bounds.left - selected.left + 8;
	}, [activeId]);
	useEffect(() => {
		if (renamingId) {
			nameInput.current?.focus();
			nameInput.current?.select();
		}
	}, [renamingId]);
	const saveUi = (next: typeof local) => {
		setLocal(next);
		onTabChange?.(next.activeId);
		void updateWorkspaceState(song.id, (current) => ({
			...current,
			noteTabs: next,
		}));
	};
	const focusEditor = (id: string | null) => {
		window.requestAnimationFrame(() => {
			if (id)
				document
					.getElementById(`note-panel-${id}`)
					?.querySelector<HTMLElement>(".cm-content")
					?.focus({ preventScroll: true });
			else addButton.current?.focus();
		});
	};
	const activate = (id: string, focus = true) => {
		saveUi({
			openIds: openIds.includes(id) ? openIds : [...openIds, id],
			activeId: id,
		});
		setRenamingId(null);
		if (focus) focusEditor(id);
	};
	const close = (id: string) => {
		const index = openIds.indexOf(id);
		const next = openIds.filter((value) => value !== id);
		saveUi({
			openIds: next,
			activeId:
				activeId === id ? (next[Math.max(0, index - 1)] ?? null) : activeId,
		});
		focusEditor(
			activeId === id ? (next[Math.max(0, index - 1)] ?? null) : activeId,
		);
	};
	const requestedRef = useRef<string | undefined>(undefined);
	const cycleState = useRef({ openIds, activeId, activate, renamingId });
	cycleState.current = { openIds, activeId, activate, renamingId };
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const direction = noteTabCycleDirection(event);
			const state = cycleState.current;
			if (!direction || state.openIds.length < 2 || state.renamingId) return;
			if (shell.current?.closest('[aria-hidden="true"]')) return;
			const modal = document.querySelector(
				'[role="dialog"][aria-modal="true"]',
			);
			if (modal && !shell.current?.contains(modal)) return;
			const index = state.activeId ? state.openIds.indexOf(state.activeId) : -1;
			const count = state.openIds.length;
			let nextIndex = direction === 1 ? 0 : count - 1;
			if (index >= 0) nextIndex = (index + direction + count) % count;
			const id = state.openIds[nextIndex];
			if (!id) return;
			event.preventDefault();
			event.stopPropagation();
			const focused = document.activeElement;
			const tabFocused =
				focused instanceof HTMLElement &&
				focused.getAttribute("role") === "tab" &&
				Boolean(tabList.current?.contains(focused));
			const inside = Boolean(
				focused instanceof Node && shell.current?.contains(focused),
			);
			state.activate(id, inside && !tabFocused);
			if (tabFocused)
				tabList.current
					?.querySelector<HTMLElement>(`[id="note-tab-${id}"]`)
					?.focus();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, []);
	useEffect(() => {
		if (
			requestedTabId &&
			requestedTabId !== requestedRef.current &&
			validIds.has(requestedTabId)
		) {
			requestedRef.current = requestedTabId;
			activate(requestedTabId, false);
		}
	});
	const task = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Notes could not be saved.",
			);
		} finally {
			setBusy(false);
		}
	};
	const create = () =>
		void task(async () => {
			let number = 1;
			while (
				tabs.some((tab) => tab.name.toLowerCase() === `untitled ${number}`)
			)
				number++;
			const id = await createNoteTab(song.id, `Untitled ${number}`);
			activate(id);
		});
	const openTabs = tabs
		.filter((tab) => openIds.includes(tab.id))
		.sort((a, b) => openIds.indexOf(a.id) - openIds.indexOf(b.id));
	return (
		<div
			ref={shell}
			className="relative flex min-h-0 flex-1 flex-col"
			data-song-notes-tabs
		>
			<div
				ref={tabList}
				role="tablist"
				aria-label="Song note tabs"
				className="song-note-tablist mx-6 flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-border-strong)] px-0 pt-[11px]"
			>
				{openTabs.map((tab) => (
					<div
						key={tab.id}
						className={`song-note-tab relative flex shrink-0 items-center px-2 border ${tab.id === activeId ? "song-note-tab--active border-[var(--color-border-strong)] bg-[var(--color-surface)]" : "border-transparent"}`}
					>
						<button
							type="button"
							className="ml-1 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
							aria-label={`Delete ${tab.name} tab`}
							title={
								tabs.length <= 1
									? "Keep at least one note tab"
									: "Delete tab and notes"
							}
							disabled={busy || tabs.length <= 1}
							onClick={() => {
								if (
									!window.confirm(
										`Delete “${tab.name}” and all of its notes? This cannot be undone.`,
									)
								)
									return;
								void task(async () => {
									await deleteNoteTab(song.id, tab.id);
									close(tab.id);
								});
							}}
						>
							<X size={12} />
						</button>
						<button
							type="button"
							role="tab"
							id={`note-tab-${tab.id}`}
							aria-controls={`note-panel-${tab.id}`}
							aria-selected={tab.id === activeId}
							tabIndex={tab.id === activeId ? 0 : -1}
							hidden={renamingId === tab.id}
							className="field-label workspace-section-heading max-w-44 truncate py-2 pr-3 pl-1"
							title={`${tab.name} — double-click to rename`}
							onClick={() => activate(tab.id, false)}
							onDoubleClick={() => {
								activate(tab.id, false);
								setName(tab.name);
								setRenamingId(tab.id);
							}}
							onKeyDown={(event) => {
								if (
									!["ArrowLeft", "ArrowRight", "Home", "End"].includes(
										event.key,
									)
								)
									return;
								event.preventDefault();
								event.stopPropagation();
								const index = openIds.indexOf(tab.id);
								const id =
									event.key === "Home"
										? openIds[0]
										: event.key === "End"
											? openIds.at(-1)
											: openIds[
													(index +
														(event.key === "ArrowRight" ? 1 : -1) +
														openIds.length) %
														openIds.length
												];
								if (id) {
									activate(id, false);
									tabList.current
										?.querySelector<HTMLElement>(`[id="note-tab-${id}"]`)
										?.focus();
								}
							}}
						>
							{tab.name}
						</button>
						{renamingId === tab.id && (
							<input
								ref={nameInput}
								aria-label="Tab name"
								value={name}
								maxLength={80}
								disabled={busy}
								className="field-label workspace-section-heading my-1 mr-2 w-36 border border-[var(--color-border-strong)] bg-transparent px-1 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
								onChange={(event) => setName(event.target.value)}
								onBlur={() => {
									if (!name.trim() || name === tab.name) {
										setRenamingId(null);
										return;
									}
									void task(async () => {
										await updateNoteTab(song.id, tab.id, { name });
										setRenamingId(null);
									});
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
									if (event.key === "Enter") {
										event.preventDefault();
										event.currentTarget.blur();
									} else if (event.key === "Escape") {
										event.preventDefault();
										setRenamingId(null);
										window.requestAnimationFrame(() => {
											document.getElementById(`note-tab-${tab.id}`)?.focus();
										});
									}
								}}
							/>
						)}
					</div>
				))}
				<button
					ref={addButton}
					type="button"
					className="my-1 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
					aria-label="New note tab"
					title="New note tab"
					disabled={busy}
					onClick={create}
				>
					<Plus size={14} />
				</button>
			</div>
			{error && (
				<p role="alert" className="px-6 text-sm">
					{error}
				</p>
			)}
			{openTabs.map((tab) => (
				<div
					key={tab.id}
					id={`note-panel-${tab.id}`}
					role="tabpanel"
					aria-labelledby={`note-tab-${tab.id}`}
					hidden={tab.id !== activeId}
					className={
						tab.id === activeId ? "flex min-h-0 flex-1 flex-col" : "hidden"
					}
				>
					<NoteDocument
						fontSize={settings.ui.songNotesFontSize}
						onFontSizeChange={(delta) => {
							void updateUiSettings((current) => ({
								...current,
								songNotesFontSize: current.songNotesFontSize + delta,
							}));
						}}
						songId={song.id}
						tab={tab}
						visible={tab.id === activeId}
						history={history}
						onActivate={activate}
						onInternalLink={onInternalLink}
					/>
				</div>
			))}
		</div>
	);
}
