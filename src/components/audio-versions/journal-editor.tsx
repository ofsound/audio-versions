import { Clock3, Link2 } from "lucide-react";
import {
	type ReactNode,
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

function renderJournal(
	value: string,
	onInternalLink?: (target: SongLinkTarget) => void,
): ReactNode[] {
	const lines = value.split(/\r?\n/);
	const rendered: ReactNode[] = [];

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const matches = [...line.matchAll(JOURNAL_URL_PATTERN)];
		const standaloneLink =
			matches.length === 1
				? getJournalLink(lines, lineIndex, matches[0])
				: null;

		if (standaloneLink?.source.includes("\n") && rendered.length > 0) {
			rendered.pop();
		}

		const content: ReactNode[] = [];
		let offset = 0;
		for (const [matchIndex, match] of matches.entries()) {
			const link = getJournalLink(lines, lineIndex, match);
			if (!link || match.index === undefined) {
				continue;
			}

			if (match.index > offset) {
				content.push(line.slice(offset, match.index));
			}
			content.push(
				<button
					key={`${link.href}-${matchIndex}`}
					type="button"
					className="journal-link-chip surface-chip"
					contentEditable={false}
					data-journal-source={link.source}
					aria-label={`Jump to ${link.label}`}
					title={link.href}
					onClick={() => onInternalLink?.(link.target)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onInternalLink?.(link.target);
						}
					}}
				>
					<Link2 size={14} />
					<span className="journal-link-label">{link.label}</span>
					{typeof link.target.timeMs === "number" ? (
						<span className="journal-link-time">
							{formatDuration(link.target.timeMs)}
						</span>
					) : null}
				</button>,
			);
			offset = match.index + match[0].length;
		}
		content.push(line.slice(offset));

		rendered.push(
			<div key={`${lineIndex}-${line}`}>
				{content.length > 0 ? content : <br />}
			</div>,
		);
	}

	return rendered;
}

function readJournal(root: HTMLElement): string {
	function readNode(node: Node): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent ?? "";
		}
		if (!(node instanceof HTMLElement)) {
			return "";
		}
		const source = node.dataset.journalSource;
		if (source !== undefined) {
			return source;
		}
		if (node.tagName === "BR") {
			return "\n";
		}
		return Array.from(node.childNodes).map(readNode).join("");
	}

	return Array.from(root.childNodes)
		.map((node) => readNode(node))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\n$/, "");
}

export function JournalEditor({
	value,
	onChange,
	onHistoryChange,
	onLocalHistoryAction,
	historyValue,
	onInternalLink,
}: JournalEditorProps) {
	const [draft, setDraft] = useState(value);
	const [historyFocusRevision, setHistoryFocusRevision] = useState(0);
	const editorRef = useRef<HTMLDivElement | null>(null);
	const draftRef = useRef(draft);
	const hasPendingLocalChangeRef = useRef(false);
	const undoStackRef = useRef<string[]>([]);
	const redoStackRef = useRef<string[]>([]);
	const lastHistoryAtRef = useRef(0);
	const restoreFocusAfterHistoryRef = useRef(false);
	const timestampFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[],
	);

	useEffect(() => {
		draftRef.current = draft;
	}, [draft]);

	useEffect(() => {
		if (value === draftRef.current) {
			hasPendingLocalChangeRef.current = false;
			return;
		}
		if (!hasPendingLocalChangeRef.current) {
			setDraft(value);
		}
	}, [value]);

	useEffect(() => {
		if (!historyValue) {
			return;
		}
		hasPendingLocalChangeRef.current = false;
		draftRef.current = historyValue.value;
		setDraft(historyValue.value);
	}, [historyValue]);

	useLayoutEffect(() => {
		if (historyFocusRevision === 0) {
			return;
		}
		if (!restoreFocusAfterHistoryRef.current) {
			return;
		}
		restoreFocusAfterHistoryRef.current = false;
		const editor = editorRef.current;
		if (!editor) {
			return;
		}
		editor.focus({ preventScroll: true });
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(editor);
		range.collapse(false);
		selection?.removeAllRanges();
		selection?.addRange(range);
	}, [historyFocusRevision]);

	const applyHistoryValue = useCallback(
		(nextValue: string) => {
			hasPendingLocalChangeRef.current = true;
			restoreFocusAfterHistoryRef.current = true;
			setHistoryFocusRevision((current) => current + 1);
			draftRef.current = nextValue;
			setDraft(nextValue);
			onChange(nextValue);
		},
		[onChange],
	);

	const commitEditor = useCallback(
		(forceHistoryBoundary = false) => {
			const editor = editorRef.current;
			if (!editor) {
				return;
			}
			const nextValue = readJournal(editor);
			const renderedLinkCount = editor.querySelectorAll(
				"[data-journal-source]",
			).length;
			if (
				countParsableJournalLinks(nextValue) > renderedLinkCount &&
				nextValue !== draftRef.current
			) {
				setDraft(nextValue);
			}
			const previousValue = draftRef.current;
			if (nextValue === previousValue) {
				return;
			}
			const now = Date.now();
			if (forceHistoryBoundary || now - lastHistoryAtRef.current > 750) {
				undoStackRef.current.push(previousValue);
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
		},
		[onChange, onHistoryChange],
	);

	const insertTimestamp = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) {
			return;
		}
		editor.focus({ preventScroll: true });
		const selection = window.getSelection();
		const range =
			selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		const timestamp = timestampFormatter.format(new Date());
		const adjacentText =
			range?.startContainer.nodeType === Node.TEXT_NODE
				? (range.startContainer.textContent ?? "")
				: "";
		const before =
			adjacentText[range?.startOffset ? range.startOffset - 1 : -1];
		const after = adjacentText[range?.endOffset ?? 0];
		const insertion = `${before && !/\s/.test(before) ? " " : ""}${timestamp}${
			after && !/\s/.test(after) ? " " : ""
		}`;
		const text = document.createTextNode(insertion);

		if (range && editor.contains(range.commonAncestorContainer)) {
			range.deleteContents();
			range.insertNode(text);
		} else {
			editor.append(text);
		}
		const nextRange = document.createRange();
		nextRange.setStartAfter(text);
		nextRange.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(nextRange);
		commitEditor(true);
	}, [commitEditor, timestampFormatter]);

	return (
		<div
			className="journal-editor-shell min-h-0 flex-1 overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)]"
			data-audio-versions-editor="journal"
		>
			<div
				className="flex h-16 shrink-0 items-center px-3"
				data-audio-versions-toolbar
			>
				<button
					type="button"
					onClick={insertTimestamp}
					className="action-secondary inline-flex h-8 items-center justify-center gap-2 px-3 text-xs font-semibold"
				>
					<Clock3 size={15} />
					Insert time
				</button>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: textarea cannot contain inline link controls */}
			<div
				key={draft}
				ref={editorRef}
				className="journal-editor min-h-0 flex-1 overflow-y-auto bg-transparent px-4 pt-0 pb-4 text-base leading-7 text-[var(--color-text)] outline-none"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				tabIndex={0}
				aria-label="Song journal"
				aria-multiline="true"
				data-placeholder="Write a note…"
				spellCheck
				onBlur={() => {
					lastHistoryAtRef.current = 0;
				}}
				onPaste={() => {
					lastHistoryAtRef.current = 0;
				}}
				onInput={() => commitEditor()}
				onKeyDown={(event) => {
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
					target.push(draftRef.current);
					lastHistoryAtRef.current = 0;
					applyHistoryValue(nextValue);
					onLocalHistoryAction?.(undo ? "undo" : "redo");
				}}
			>
				{renderJournal(draft, onInternalLink)}
			</div>
		</div>
	);
}
