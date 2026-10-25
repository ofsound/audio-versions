import { Clock3 } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { parseSongTarget } from "#/lib/audio-versions/links";
import type { SongLinkTarget } from "#/lib/audio-versions/types";
import { formatDuration } from "#/lib/audio-versions/waveform";
import {
	adjacentJournalTimestamp,
	captureJournalSelection,
	captureJournalViewport,
	type JournalSelection,
	readJournal,
	restoreJournalSelection,
} from "./journal-editor-dom";

interface JournalEditorProps {
	value: string;
	onChange: (value: string) => void;
	onHistoryChange?: (previousValue: string, nextValue: string) => void;
	onLocalHistoryAction?: (action: "undo" | "redo") => void;
	historyValue?: { revision: number; value: string };
	onInternalLink?: (target: SongLinkTarget) => void;
}

interface JournalLink {
	href: string;
	label: string;
	source: string;
	target: SongLinkTarget;
}

const JOURNAL_URL_PATTERN = /(?:https?:\/\/[^\s]+|\/songs\/[^\s]+)/g;
const JOURNAL_URL_PREFIX_PATTERN = /(?:https?:\/\/|\/songs\/)/;
const JOURNAL_INLINE_FORMAT_PATTERN = /(\*\*[^*\n]+\*\*|_[^_\n]+_)/g;
const JOURNAL_ATOM_PATTERN =
	/(?:https?:\/\/[^\s]+|\/songs\/[^\s]+|\{\{timestamp:[^}\n]+\}\})/g;

function getJournalTimestamp(source: string): string | null {
	const match = /^\{\{timestamp:([^}\n]+)\}\}$/.exec(source);
	return match?.[1] ?? null;
}

function renderJournalTimestamp(source: string, label: string) {
	const chip = document.createElement("span");
	chip.className = "journal-link-chip journal-timestamp-chip surface-chip";
	chip.setAttribute("contenteditable", "false");
	chip.setAttribute("role", "button");
	chip.tabIndex = 0;
	chip.dataset.journalSource = source;
	chip.setAttribute("aria-label", `Timestamp ${label}`);
	chip.title = "Select timestamp, then press Delete or Backspace to remove it";
	const icon = document.createElement("span");
	icon.className = "journal-timestamp-icon";
	icon.setAttribute("aria-hidden", "true");
	const text = document.createElement("span");
	text.className = "journal-link-label";
	text.textContent = label;
	chip.append(icon, text);
	return chip;
}

function renderJournalText(
	value: string,
	renderPlain: (text: string) => Node[],
): Node[] {
	const rendered: Node[] = [];
	let offset = 0;
	for (const match of value.matchAll(JOURNAL_INLINE_FORMAT_PATTERN)) {
		if (match.index > offset)
			rendered.push(...renderPlain(value.slice(offset, match.index)));
		const bold = match[0].startsWith("**");
		const element = document.createElement(bold ? "strong" : "em");
		element.append(
			...renderPlain(match[0].slice(bold ? 2 : 1, bold ? -2 : -1)),
		);
		rendered.push(element);
		offset = match.index + match[0].length;
	}
	if (offset < value.length) rendered.push(...renderPlain(value.slice(offset)));
	return rendered;
}

function countParsableJournalLinks(value: string): number {
	return [...value.matchAll(JOURNAL_URL_PATTERN)].filter((match) =>
		parseSongTarget(match[0].replace(/[),.;!?]+$/, "")),
	).length;
}

function getJournalLink(
	lines: string[],
	lineIndex: number,
	match: RegExpMatchArray,
): JournalLink | null {
	const href = match[0].replace(/[),.;!?]+$/, "");
	const target = parseSongTarget(href);
	if (!target) {
		return null;
	}

	const previousLine = lines[lineIndex - 1]?.trim();
	const isStandaloneUrl = lines[lineIndex].trim() === match[0];
	const hasStandaloneLabel =
		isStandaloneUrl &&
		previousLine &&
		!JOURNAL_URL_PREFIX_PATTERN.test(previousLine);
	const label = hasStandaloneLabel
		? previousLine
		: target.annotationId
			? "Marker link"
			: "Song link";

	return {
		href,
		label,
		source: hasStandaloneLabel ? `${lines[lineIndex - 1]}\n${href}` : href,
		target,
	};
}

function renderJournalAtoms(
	line: string,
	lines: string[],
	lineIndex: number,
): Node[] {
	const paragraph = document.createDocumentFragment();
	let offset = 0;
	for (const match of line.matchAll(JOURNAL_ATOM_PATTERN)) {
		const timestamp = getJournalTimestamp(match[0]);
		const link = timestamp ? null : getJournalLink(lines, lineIndex, match);
		if (!timestamp && !link) continue;
		paragraph.append(document.createTextNode(line.slice(offset, match.index)));
		if (timestamp) {
			paragraph.append(renderJournalTimestamp(match[0], timestamp));
			offset = match.index + match[0].length;
		} else if (link) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "journal-link-chip surface-chip";
			button.setAttribute("contenteditable", "false");
			button.dataset.journalSource = link.source;
			button.dataset.journalHref = link.href;
			button.setAttribute("aria-label", `Jump to ${link.label}`);
			button.title = link.href;
			const label = document.createElement("span");
			label.className = "journal-link-label";
			label.textContent = link.label;
			const icon = document.createElement("span");
			icon.className = "journal-link-icon";
			icon.setAttribute("aria-hidden", "true");
			button.append(icon, label);
			if (typeof link.target.timeMs === "number") {
				const time = document.createElement("span");
				time.className = "journal-link-time";
				time.textContent = formatDuration(link.target.timeMs);
				button.append(time);
			}
			paragraph.append(button);
			offset = match.index + match[0].length;
		}
	}
	paragraph.append(document.createTextNode(line.slice(offset)));
	return Array.from(paragraph.childNodes);
}

/** The browser owns this subtree while editing; React never reconciles its children. */
function renderJournal(value: string): DocumentFragment {
	const lines = value.split(/\r?\n/);
	const rendered = document.createDocumentFragment();
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const links = [...line.matchAll(JOURNAL_URL_PATTERN)];
		const standalone =
			links.length === 1 ? getJournalLink(lines, lineIndex, links[0]) : null;
		if (standalone?.source.includes("\n")) rendered.lastChild?.remove();
		const paragraph = document.createElement("div");
		paragraph.append(
			...renderJournalText(line, (text) =>
				renderJournalAtoms(text, lines, lineIndex),
			),
		);
		if (!paragraph.hasChildNodes())
			paragraph.append(document.createElement("br"));
		rendered.append(paragraph);
	}
	return rendered;
}

function isTimestampSelected(chip: HTMLElement) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount !== 1 || !chip.parentNode)
		return false;
	const range = selection.getRangeAt(0);
	const index = Array.from(chip.parentNode.childNodes).indexOf(chip);
	return (
		range.startContainer === chip.parentNode &&
		range.endContainer === chip.parentNode &&
		range.startOffset === index &&
		range.endOffset === index + 1
	);
}

export function JournalEditor({
	value,
	onChange,
	onHistoryChange,
	onLocalHistoryAction,
	historyValue,
	onInternalLink,
}: JournalEditorProps) {
	const [documentValue, setDocumentValue] = useState({ value, revision: 0 });
	const editorRef = useRef<HTMLDivElement | null>(null);
	const draftRef = useRef(value);
	const hasPendingLocalChangeRef = useRef(false);
	const undoStackRef = useRef<
		{ value: string; selection: JournalSelection | null }[]
	>([]);
	const redoStackRef = useRef<
		{ value: string; selection: JournalSelection | null }[]
	>([]);
	const lastHistoryAtRef = useRef(0);
	const selectionBeforeInputRef = useRef<JournalSelection | null>(null);
	const savedSelectionRef = useRef<JournalSelection | null>(null);
	const isComposingRef = useRef(false);
	const selectedTimestampRef = useRef<HTMLElement | null>(null);
	const pendingRestoreRef = useRef<{
		selection: JournalSelection | null;
		focused: boolean;
		restoreViewport: () => void;
	} | null>(null);
	const timestampFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[],
	);

	const rewriteDocument = useCallback(
		(nextValue: string, selection?: JournalSelection | null) => {
			const editor = editorRef.current;
			if (editor) {
				pendingRestoreRef.current = {
					selection:
						selection === undefined
							? captureJournalSelection(editor)
							: selection,
					focused: document.activeElement === editor,
					restoreViewport: captureJournalViewport(editor),
				};
			}
			setDocumentValue((current) => ({
				value: nextValue,
				revision: current.revision + 1,
			}));
		},
		[],
	);

	useLayoutEffect(() => {
		const pending = pendingRestoreRef.current;
		const editor = editorRef.current;
		pendingRestoreRef.current = null;
		if (!editor) return;
		editor.replaceChildren(renderJournal(documentValue.value));
		if (!pending) return;
		if (pending.focused && pending.selection) {
			editor.focus({ preventScroll: true });
			restoreJournalSelection(editor, pending.selection);
		}
		pending.restoreViewport();
	}, [documentValue]);

	useEffect(() => {
		if (value === draftRef.current) {
			hasPendingLocalChangeRef.current = false;
			return;
		}
		if (!hasPendingLocalChangeRef.current && !isComposingRef.current) {
			draftRef.current = value;
			rewriteDocument(value);
		}
	}, [value, rewriteDocument]);

	const historyRevisionRef = useRef<number | null>(null);
	useEffect(() => {
		if (!historyValue || historyRevisionRef.current === historyValue.revision)
			return;
		historyRevisionRef.current = historyValue.revision;
		hasPendingLocalChangeRef.current = false;
		draftRef.current = historyValue.value;
		rewriteDocument(historyValue.value);
	}, [historyValue, rewriteDocument]);

	const applyHistoryValue = useCallback(
		(entry: { value: string; selection: JournalSelection | null }) => {
			hasPendingLocalChangeRef.current = true;
			draftRef.current = entry.value;
			rewriteDocument(entry.value, entry.selection);
			onChange(entry.value);
		},
		[onChange, rewriteDocument],
	);

	const commitEditor = useCallback(
		(forceHistoryBoundary = false) => {
			const editor = editorRef.current;
			if (!editor || isComposingRef.current) return;
			const nextValue = readJournal(editor);
			const renderedLinkCount = editor.querySelectorAll(
				"[data-journal-href]",
			).length;
			if (
				forceHistoryBoundary &&
				countParsableJournalLinks(nextValue) > renderedLinkCount &&
				nextValue !== draftRef.current
			) {
				rewriteDocument(nextValue);
			}
			const previousValue = draftRef.current;
			if (nextValue === previousValue) {
				return;
			}
			const now = Date.now();
			if (forceHistoryBoundary || now - lastHistoryAtRef.current > 750) {
				undoStackRef.current.push({
					value: previousValue,
					selection: selectionBeforeInputRef.current,
				});
				if (undoStackRef.current.length > 100) {
					undoStackRef.current.shift();
				}
			}
			lastHistoryAtRef.current = now;
			redoStackRef.current = [];
			hasPendingLocalChangeRef.current = true;
			draftRef.current = nextValue;
			onChange(nextValue);
			onHistoryChange?.(previousValue, nextValue);
			selectionBeforeInputRef.current = null;
		},
		[onChange, onHistoryChange, rewriteDocument],
	);

	const insertTimestamp = useCallback(() => {
		const editor = editorRef.current;
		if (!editor || isComposingRef.current) return;
		const restoreViewport = captureJournalViewport(editor);
		const selectionAtInsertion =
			captureJournalSelection(editor) ?? savedSelectionRef.current;
		editor.focus({ preventScroll: true });
		if (selectionAtInsertion)
			restoreJournalSelection(editor, selectionAtInsertion);
		selectionBeforeInputRef.current = captureJournalSelection(editor);
		const selection = window.getSelection();
		const range =
			selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		const timestamp = timestampFormatter.format(new Date());
		const source = `{{timestamp:${timestamp}}}`;
		const adjacentText =
			range?.startContainer.nodeType === Node.TEXT_NODE
				? (range.startContainer.textContent ?? "")
				: "";
		const before =
			adjacentText[range?.startOffset ? range.startOffset - 1 : -1];
		const after = adjacentText[range?.endOffset ?? 0];
		const leadingText = document.createTextNode(
			before && !/\s/.test(before) ? " " : "",
		);
		const chip = renderJournalTimestamp(source, timestamp);
		const trailingText = document.createTextNode(
			after && !/\s/.test(after) ? " " : "",
		);
		const insertion = document.createDocumentFragment();
		insertion.append(leadingText, chip, trailingText);

		if (range && editor.contains(range.commonAncestorContainer)) {
			range.deleteContents();
			range.insertNode(insertion);
		} else {
			editor.append(insertion);
		}
		const nextRange = document.createRange();
		nextRange.setStartAfter(trailingText);
		nextRange.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(nextRange);
		commitEditor(true);
		restoreViewport();
	}, [commitEditor, timestampFormatter]);

	const selectTimestamp = useCallback((chip: HTMLElement) => {
		const editor = editorRef.current;
		if (!editor || !editor.contains(chip)) return;
		const restoreViewport = captureJournalViewport(editor);
		selectedTimestampRef.current?.removeAttribute("data-journal-selected");
		editor.focus({ preventScroll: true });
		const range = document.createRange();
		range.selectNode(chip);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		chip.dataset.journalSelected = "true";
		selectedTimestampRef.current = chip;
		restoreViewport();
	}, []);

	useEffect(() => {
		const clearInactiveTimestamp = () => {
			const chip = selectedTimestampRef.current;
			if (!chip) return;
			if (isTimestampSelected(chip)) return;
			chip.removeAttribute("data-journal-selected");
			selectedTimestampRef.current = null;
		};
		document.addEventListener("selectionchange", clearInactiveTimestamp);
		return () =>
			document.removeEventListener("selectionchange", clearInactiveTimestamp);
	}, []);

	return (
		<div
			className="journal-editor-shell flex min-h-0 flex-1 flex-col overflow-hidden"
			data-audio-versions-editor="journal"
		>
			<div
				className="flex h-16 shrink-0 items-center justify-between gap-3 px-6"
				data-audio-versions-toolbar
			>
				<span className="field-label workspace-section-heading">
					Song Notes
				</span>
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={insertTimestamp}
					className="action-secondary inline-flex h-8 items-center justify-center gap-2 px-3 text-xs font-semibold"
				>
					<Clock3 size={15} />
					Insert Timestamp
				</button>
			</div>
			<div className="journal-editor-frame-wrap flex min-h-0 flex-1 flex-col px-6 pb-3">
				{/* biome-ignore lint/a11y/useSemanticElements: textarea cannot contain inline link controls */}
				<div
					ref={editorRef}
					className="journal-editor journal-editor-frame min-h-0 flex-1 overflow-y-auto border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-3 text-base leading-7 text-[var(--color-text)] outline-none"
					contentEditable
					suppressContentEditableWarning
					role="textbox"
					tabIndex={0}
					aria-label="Song notes"
					aria-multiline="true"
					data-placeholder="Write a note…"
					spellCheck
					onClick={(event) => {
						if (!(event.target instanceof HTMLElement)) return;
						const chip = event.target.closest<HTMLElement>(
							".journal-timestamp-chip",
						);
						if (chip) {
							event.preventDefault();
							selectTimestamp(chip);
							return;
						}
						const href = event.target.closest<HTMLElement>(
							"[data-journal-href]",
						)?.dataset.journalHref;
						if (href) {
							const target = parseSongTarget(href);
							if (target) onInternalLink?.(target);
						}
					}}
					onBlur={(event) => {
						savedSelectionRef.current = captureJournalSelection(
							event.currentTarget,
						);
						lastHistoryAtRef.current = 0;
					}}
					onBeforeInput={(event) => {
						if (isComposingRef.current) return;
						selectionBeforeInputRef.current = captureJournalSelection(
							event.currentTarget,
						);
					}}
					onCompositionStart={(event) => {
						isComposingRef.current = true;
						selectionBeforeInputRef.current = captureJournalSelection(
							event.currentTarget,
						);
					}}
					onCompositionEnd={() => {
						isComposingRef.current = false;
						commitEditor(true);
					}}
					onPaste={(event) => {
						event.preventDefault();
						const editor = editorRef.current;
						const selection = window.getSelection();
						if (!editor || !selection?.rangeCount) return;
						const range = selection.getRangeAt(0);
						if (!editor.contains(range.commonAncestorContainer)) return;
						selectionBeforeInputRef.current = captureJournalSelection(editor);
						const plainText = event.clipboardData.getData("text/plain");
						if (!plainText) return;
						const text = document.createTextNode(
							plainText.replace(/\r\n?/g, "\n"),
						);
						range.deleteContents();
						range.insertNode(text);
						range.setStartAfter(text);
						range.collapse(true);
						selection.removeAllRanges();
						selection.addRange(range);
						commitEditor(true);
					}}
					onInput={() => commitEditor()}
					onKeyDown={(event) => {
						if (isComposingRef.current || event.nativeEvent.isComposing) return;
						if (!event.metaKey && !event.ctrlKey && !event.altKey) {
							selectionBeforeInputRef.current = captureJournalSelection(
								event.currentTarget,
							);
						}
						const targetChip =
							event.target instanceof HTMLElement
								? event.target.closest<HTMLElement>(".journal-timestamp-chip")
								: null;
						if (targetChip && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							selectTimestamp(targetChip);
							return;
						}
						const isDeletion =
							event.key === "Delete" || event.key === "Backspace";
						const adjacent =
							isDeletion && !event.metaKey && !event.ctrlKey && !event.altKey
								? adjacentJournalTimestamp(
										event.currentTarget,
										event.key === "Backspace" ? "backward" : "forward",
									)
								: null;
						const selected =
							targetChip ??
							(selectedTimestampRef.current &&
							isTimestampSelected(selectedTimestampRef.current)
								? selectedTimestampRef.current
								: adjacent);
						const selection = window.getSelection();
						if (
							selected &&
							event.currentTarget.contains(selected) &&
							isDeletion &&
							(targetChip ||
								isTimestampSelected(selected) ||
								selected === adjacent)
						) {
							event.preventDefault();
							const restoreViewport = captureJournalViewport(
								event.currentTarget,
							);
							selectionBeforeInputRef.current = captureJournalSelection(
								event.currentTarget,
							);
							const range = document.createRange();
							range.setStartBefore(selected);
							range.collapse(true);
							selectedTimestampRef.current?.removeAttribute(
								"data-journal-selected",
							);
							selected.remove();
							selectedTimestampRef.current = null;
							event.currentTarget.focus({ preventScroll: true });
							selection?.removeAllRanges();
							selection?.addRange(range);
							commitEditor(true);
							restoreViewport();
							return;
						}
						const commandKey = event.metaKey || event.ctrlKey;
						const key = event.key.toLowerCase();
						const undo = commandKey && key === "z" && !event.shiftKey;
						const redo =
							commandKey &&
							((key === "z" && event.shiftKey) ||
								(key === "y" && !event.metaKey && !event.shiftKey));
						if (
							(!undo && !redo) ||
							event.altKey ||
							event.nativeEvent.isComposing
						) {
							return;
						}

						const source = undo ? undoStackRef.current : redoStackRef.current;
						const nextValue = source.pop();
						if (nextValue === undefined) {
							return;
						}
						event.preventDefault();
						const target = undo ? redoStackRef.current : undoStackRef.current;
						target.push({
							value: draftRef.current,
							selection: captureJournalSelection(event.currentTarget),
						});
						lastHistoryAtRef.current = 0;
						applyHistoryValue(nextValue);
						onLocalHistoryAction?.(undo ? "undo" : "redo");
					}}
				/>
			</div>
		</div>
	);
}
