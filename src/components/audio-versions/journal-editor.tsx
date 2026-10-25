import { redo, undo, undoDepth } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Clock3, Keyboard } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SongLinkTarget } from "#/lib/audio-versions/types";
import {
	externalJournalUpdate,
	insertJournalTimestamp,
	journalExtensions,
} from "./journal-editor-engine";

interface JournalEditorProps {
	value: string;
	onChange: (value: string) => void;
	onHistoryChange?: (
		previousValue: string,
		nextValue: string,
		group?: number,
	) => void;
	onLocalHistoryAction?: (action: "undo" | "redo") => void;
	historyValue?: { revision: number; value: string; action?: "undo" | "redo" };
	onInternalLink?: (target: SongLinkTarget) => void;
	visible?: boolean;
	showHeading?: boolean;
}

/** Minimal replacement keeps unaffected selections and scroll positions intact. */
function replaceJournal(view: EditorView, value: string) {
	const current = view.state.doc.toString();
	if (current === value) return;
	let from = 0,
		end = current.length,
		nextEnd = value.length;
	while (from < end && from < nextEnd && current[from] === value[from]) from++;
	while (
		end > from &&
		nextEnd > from &&
		current[end - 1] === value[nextEnd - 1]
	) {
		end--;
		nextEnd--;
	}
	view.dispatch({
		changes: { from, to: end, insert: value.slice(from, nextEnd) },
		annotations: [
			externalJournalUpdate.of(true),
			Transaction.addToHistory.of(false),
		],
	});
}

export function JournalEditor(props: JournalEditorProps) {
	const {
		value: sourceValue,
		historyValue,
		visible = true,
		showHeading = true,
	} = props;
	const value = sourceValue.replace(/\r\n?/g, "\n");
	const host = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const callbacks = useRef(props);
	callbacks.current = props;
	const draft = useRef(value),
		emitted = useRef(value),
		pending = useRef(false),
		composing = useRef(false);
	const compositionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const historyRevision = useRef<number | undefined>(undefined);
	const replaying = useRef(false);
	useEffect(() => {
		if (!host.current) return;
		const emit = (view: EditorView, isHistory = false) => {
			const next = view.state.doc.toString();
			draft.current = next;
			if (composing.current || next === emitted.current) return;
			const previous = emitted.current;
			emitted.current = next;
			pending.current = true;
			callbacks.current.onChange(next);
			if (!isHistory)
				callbacks.current.onHistoryChange?.(
					previous,
					next,
					undoDepth(view.state),
				);
		};
		const view = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: draft.current,
				extensions: [
					journalExtensions(() => callbacks.current),
					EditorView.updateListener.of((update) => {
						if (!update.docChanged || replaying.current) return;
						if (
							update.transactions.some((tr) =>
								tr.annotation(externalJournalUpdate),
							)
						)
							return;
						emit(
							update.view,
							update.transactions.some(
								(tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"),
							),
						);
					}),
					EditorView.domEventObservers({
						compositionstart() {
							composing.current = true;
							clearTimeout(compositionTimer.current);
						},
						compositionend(_event, editor) {
							compositionTimer.current = setTimeout(() => {
								composing.current = false;
								emit(editor);
							}, 30);
						},
						blur(_event, editor) {
							if (!composing.current) emit(editor);
						},
					}),
				],
			}),
		});
		viewRef.current = view;
		return () => {
			clearTimeout(compositionTimer.current);
			composing.current = false;
			emit(view);
			view.destroy();
			viewRef.current = null;
		};
	}, []);
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		if (value === draft.current) {
			pending.current = false;
			return;
		}
		if (pending.current || composing.current || view.composing) return;
		draft.current = value;
		emitted.current = value;
		replaceJournal(view, value);
	}, [value]);
	useEffect(() => {
		const view = viewRef.current;
		if (
			!view ||
			!historyValue ||
			historyRevision.current === historyValue.revision
		)
			return;
		historyRevision.current = historyValue.revision;
		pending.current = false;
		draft.current = historyValue.value;
		emitted.current = historyValue.value;
		replaying.current = true;
		try {
			if (historyValue.action)
				(historyValue.action === "undo" ? undo : redo)(view);
			replaceJournal(view, historyValue.value);
		} finally {
			replaying.current = false;
		}
	}, [historyValue]);
	useEffect(() => {
		if (visible) viewRef.current?.requestMeasure();
	}, [visible]);
	return (
		<div
			className="journal-editor-shell flex min-h-0 flex-1 flex-col overflow-hidden"
			data-audio-versions-editor="journal"
		>
			<div
				className={`flex shrink-0 items-center justify-between gap-3 px-6 ${showHeading ? "h-16" : "h-11"}`}
				data-audio-versions-toolbar
			>
				{showHeading ? (
					<span className="field-label workspace-section-heading">
						Song Notes
					</span>
				) : (
					<span />
				)}
				<div className="flex items-center gap-2">
					<span
						role="img"
						title="Option-drag: column selection · Option-click: add cursor · Cmd-D: next match · Cmd-F: find · Cmd-B/I: bold/italic"
						aria-label="Editing shortcuts: Option-drag column selection, Option-click multiple cursors, Command-D next match, Command-F find, Command-B bold, Command-I italic"
						className="text-[var(--color-text-muted)]"
					>
						<Keyboard size={15} />
					</span>
					<button
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => {
							if (viewRef.current && !composing.current)
								insertJournalTimestamp(
									viewRef.current,
									new Intl.DateTimeFormat(undefined, {
										dateStyle: "medium",
										timeStyle: "short",
									}).format(new Date()),
								);
						}}
						className="action-secondary inline-flex h-8 items-center justify-center gap-2 px-3 text-xs font-semibold"
					>
						<Clock3 size={15} />
						Insert Timestamp
					</button>
				</div>
			</div>
			<div className="journal-editor-frame-wrap flex min-h-0 flex-1 flex-col px-6 pb-3">
				<div
					ref={host}
					className="journal-codemirror journal-editor-frame min-h-0 flex-1 overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-base leading-7 text-[var(--color-text)]"
				/>
			</div>
		</div>
	);
}
