import { MoreHorizontal, Plus, X } from "lucide-react";
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
import { useCloseOnEscape } from "./use-close-on-escape";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";
import type { useSongWorkspaceHistory } from "./use-song-workspace-history";

type WorkspaceHistory = ReturnType<typeof useSongWorkspaceHistory>;

function NoteDocument({
	songId,
	tab,
	visible,
	history,
	onActivate,
	onInternalLink,
}: {
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
	const { createNoteTab, updateNoteTab, deleteNoteTab, updateWorkspaceState } =
		useAudioVersions();
	const tabs = getSongNoteTabs(song);
	const initial = workspace.noteTabs ?? {
		openIds: [tabs[0].id],
		activeId: tabs[0].id,
	};
	const [local, setLocal] = useState(initial);
	const validIds = new Set(tabs.map((tab) => tab.id));
	const openIds = local.openIds.filter((id) => validIds.has(id));
	const activeId =
		local.activeId && openIds.includes(local.activeId)
			? local.activeId
			: (openIds.at(-1) ?? null);
	const active = tabs.find((tab) => tab.id === activeId);
	const [menu, setMenu] = useState<"new" | "actions" | "rename" | null>(null);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const shell = useRef<HTMLDivElement>(null);
	const tabList = useRef<HTMLDivElement>(null);
	const popup = useRef<HTMLDivElement>(null);
	const toolbar = useRef<HTMLDivElement>(null);
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
		if (menu === "new" || menu === "rename") nameInput.current?.focus();
	}, [menu]);
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
			else toolbar.current?.querySelector<HTMLButtonElement>("button")?.focus();
		});
	};
	const activate = (id: string, focus = true) => {
		saveUi({
			openIds: openIds.includes(id) ? openIds : [...openIds, id],
			activeId: id,
		});
		setMenu(null);
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
	useCloseOnEscape(Boolean(menu), () => {
		const selector =
			menu === "new"
				? '[aria-label="New or reopen note tab"]'
				: '[aria-label="Note tab actions"]';
		setMenu(null);
		toolbar.current?.querySelector<HTMLElement>(selector)?.focus();
	});
	useEffect(() => {
		if (!menu) return;
		const dismiss = (event: MouseEvent) => {
			if (
				event.target instanceof Node &&
				!popup.current?.contains(event.target) &&
				!toolbar.current?.contains(event.target)
			)
				setMenu(null);
		};
		document.addEventListener("mousedown", dismiss);
		return () => document.removeEventListener("mousedown", dismiss);
	}, [menu]);
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
	const create = (newName: string) =>
		void task(async () => {
			const id = await createNoteTab(song.id, newName);
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
				ref={toolbar}
				className="flex h-16 shrink-0 items-center justify-between gap-2 px-6"
			>
				<span className="field-label workspace-section-heading">
					Song Notes
				</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="icon-button"
						aria-label="New or reopen note tab"
						title="New or reopen note tab"
						aria-expanded={menu === "new"}
						onClick={() => {
							setName("");
							setError(null);
							setMenu(menu === "new" ? null : "new");
						}}
					>
						<Plus size={16} />
					</button>
					<button
						type="button"
						className="icon-button"
						aria-label="Note tab actions"
						title="Rename or delete this note"
						disabled={!active}
						aria-expanded={menu === "actions" || menu === "rename"}
						onClick={() => {
							setError(null);
							setMenu(menu === "actions" ? null : "actions");
						}}
					>
						<MoreHorizontal size={16} />
					</button>
				</div>
			</div>
			<div
				ref={tabList}
				role="tablist"
				aria-label="Song note tabs"
				className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-border-plain)] px-6 pb-1"
			>
				{openTabs.map((tab) => (
					<div
						key={tab.id}
						className={`flex shrink-0 items-center border ${tab.id === activeId ? "border-[var(--color-accent-strong)] bg-[var(--color-surface)]" : "border-transparent"}`}
					>
						<button
							type="button"
							role="tab"
							id={`note-tab-${tab.id}`}
							aria-controls={`note-panel-${tab.id}`}
							aria-selected={tab.id === activeId}
							tabIndex={tab.id === activeId ? 0 : -1}
							className={`max-w-44 truncate py-2 pr-2 pl-3 text-sm ${tab.id === activeId ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
							title={`${tab.name} — double-click to rename`}
							onClick={() => activate(tab.id)}
							onDoubleClick={() => {
								activate(tab.id);
								setName(tab.name);
								setMenu("rename");
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
						<button
							type="button"
							className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
							aria-label={`Close ${tab.name} tab`}
							title="Close tab (notes stay saved)"
							onClick={() => close(tab.id)}
						>
							<X size={12} />
						</button>
					</div>
				))}
			</div>
			{menu && (
				<div
					ref={popup}
					className="absolute top-14 right-4 z-30 grid max-h-[min(32rem,70dvh)] overflow-y-auto w-72 max-w-[calc(100%-2rem)] gap-3 border border-[var(--color-border-strong)] bg-[var(--color-surface-overlay)] p-3 shadow-xl"
					role="dialog"
					aria-label={
						menu === "new" ? "New or reopen note tab" : "Note tab actions"
					}
				>
					{menu === "new" || menu === "rename" ? (
						<form
							className="grid gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (menu === "new") create(name);
								else if (active)
									void task(async () => {
										await updateNoteTab(song.id, active.id, { name });
										setMenu(null);
									});
							}}
						>
							<label className="grid gap-1 text-sm">
								{menu === "new" ? "New tab name" : "Tab name"}
								<input
									ref={nameInput}
									value={name}
									maxLength={80}
									onChange={(event) => setName(event.target.value)}
									className="input-field w-full"
									placeholder="Mixing, Recording, Mastering…"
								/>
							</label>
							<button
								type="submit"
								disabled={busy || !name.trim()}
								className="action-secondary px-3 py-2 text-sm"
							>
								{menu === "new" ? "Create tab" : "Save name"}
							</button>
						</form>
					) : (
						<>
							<button
								type="button"
								className="action-secondary px-3 py-2 text-left text-sm"
								onClick={() => {
									setName(active?.name ?? "");
									setMenu("rename");
								}}
							>
								Rename tab
							</button>
							<button
								type="button"
								disabled={busy || tabs.length <= 1}
								className="action-secondary px-3 py-2 text-left text-sm"
								onClick={() => {
									if (
										!active ||
										!window.confirm(
											`Delete “${active.name}” and all of its notes? This cannot be undone. Closing a tab keeps its notes instead.`,
										)
									)
										return;
									const id = active.id;
									void task(async () => {
										await deleteNoteTab(song.id, id);
										close(id);
										setMenu(null);
									});
								}}
							>
								Delete notes…
							</button>
						</>
					)}
					{menu === "new" && (
						<>
							<div className="flex flex-wrap gap-1">
								{["Mixing", "Recording", "Mastering"]
									.filter(
										(preset) =>
											!tabs.some(
												(tab) =>
													tab.name.toLowerCase() === preset.toLowerCase(),
											),
									)
									.map((preset) => (
										<button
											type="button"
											key={preset}
											disabled={busy}
											className="action-secondary px-2 py-1 text-xs"
											onClick={() => create(preset)}
										>
											{preset}
										</button>
									))}
							</div>
							{tabs
								.filter((tab) => !openIds.includes(tab.id))
								.map((tab) => (
									<button
										type="button"
										key={tab.id}
										className="action-secondary truncate px-3 py-2 text-left text-sm"
										onClick={() => activate(tab.id)}
									>
										Reopen {tab.name}
									</button>
								))}
						</>
					)}
					{error && (
						<p role="alert" className="text-sm">
							{error}
						</p>
					)}
				</div>
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
						songId={song.id}
						tab={tab}
						visible={tab.id === activeId}
						history={history}
						onActivate={activate}
						onInternalLink={onInternalLink}
					/>
				</div>
			))}
			{!active && (
				<div className="grid flex-1 content-center justify-items-center gap-3 px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
					<p>All note tabs are closed. Your notes are still saved.</p>
					<button
						type="button"
						className="action-secondary px-3 py-2"
						onClick={() => setMenu("new")}
					>
						New or reopen tab
					</button>
				</div>
			)}
		</div>
	);
}
