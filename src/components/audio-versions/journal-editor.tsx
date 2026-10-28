import { redo, undo, undoDepth } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Clock3, Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SongLinkTarget } from "#/lib/audio-versions/types";
import {
	externalJournalUpdate,
	insertJournalTimestamp,
	journalExtensions,
} from "./journal-editor-engine";

interface JournalEditorProps {
	fontSize?: number;
	onFontSizeChange?: (delta: number) => void;
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
		fontSize = 14,
		onFontSizeChange,
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
		if (visible && fontSize > 0) viewRef.current?.requestMeasure();
	}, [visible, fontSize]);
	return (
		<div
			className="journal-editor-shell flex min-h-0 flex-1 flex-col overflow-hidden"
			data-audio-versions-editor="journal"
		>
			{showHeading && (
				<div className="flex h-16 shrink-0 items-center px-6">
					<span className="field-label workspace-section-heading">
						Song Notes
					</span>
				</div>
			)}
			<div
				className={`journal-editor-frame-wrap flex min-h-0 flex-1 flex-col px-6 ${showHeading ? "pb-3" : "journal-editor-tabbed"}`}
			>
				<div
					ref={host}
					style={{ fontSize: `${fontSize}px` }}
					className="journal-codemirror journal-editor-frame min-h-0 flex-1 overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)]"
				/>
				<div
					className={`flex shrink-0 items-center justify-between gap-2 ${showHeading ? "py-2" : "py-3.5"}`}
					data-audio-versions-toolbar
				>
					{onFontSizeChange ? (
						<fieldset
							aria-label="Note text size"
							className="m-0 flex min-w-0 items-center gap-1 border-0 p-0 text-xs text-[var(--color-text-muted)]"
						>
							<button
								type="button"
								aria-label="Decrease note text size"
								disabled={fontSize <= 10}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onFontSizeChange(-1)}
								className="icon-button icon-button--sm"
							>
								<Minus size={13} />
							</button>
							<span
								className="min-w-8 text-center tabular-nums"
								aria-live="polite"
							>
								{fontSize}px
							</span>
							<button
								type="button"
								aria-label="Increase note text size"
								disabled={fontSize >= 28}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onFontSizeChange(1)}
								className="icon-button icon-button--sm"
							>
								<Plus size={13} />
							</button>
						</fieldset>
					) : (
						<span />
					)}
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
		</div>
	);
}
