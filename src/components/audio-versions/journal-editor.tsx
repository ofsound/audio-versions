import { Clock3, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSongTarget } from "#/lib/audio-versions/links";
import type { SongLinkTarget } from "#/lib/audio-versions/types";

interface JournalEditorProps {
	value: string;
	onChange: (value: string) => void;
	onInternalLink?: (target: SongLinkTarget) => void;
}

interface JournalLink {
	href: string;
	label: string;
	target: SongLinkTarget;
}

const JOURNAL_URL_PATTERN = /(?:https?:\/\/[^\s]+|\/songs\/[^\s]+)/g;
const JOURNAL_URL_PREFIX_PATTERN = /(?:https?:\/\/|\/songs\/)/;

function extractJournalLinks(value: string): JournalLink[] {
	const lines = value.split(/\r?\n/);
	const links: JournalLink[] = [];
	const seenHrefs = new Set<string>();

	for (const [lineIndex, line] of lines.entries()) {
		for (const match of line.matchAll(JOURNAL_URL_PATTERN)) {
			const href = match[0].replace(/[),.;!?]+$/, "");
			const target = parseSongTarget(href);
			if (!target || seenHrefs.has(href)) {
				continue;
			}

			const previousLine = lines[lineIndex - 1]?.trim();
			const isStandaloneUrl = line.trim() === match[0] || line.trim() === href;
			const label =
				isStandaloneUrl &&
				previousLine &&
				!JOURNAL_URL_PREFIX_PATTERN.test(previousLine)
					? previousLine
					: target.annotationId
						? "Marker link"
						: "Song link";
			seenHrefs.add(href);
			links.push({ href, label, target });
		}
	}

	return links;
}

export function JournalEditor({
	value,
	onChange,
	onInternalLink,
}: JournalEditorProps) {
	const [draft, setDraft] = useState(value);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const draftRef = useRef(draft);
	const hasPendingLocalChangeRef = useRef(false);
	const timestampFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[],
	);
	const journalLinks = useMemo(() => extractJournalLinks(draft), [draft]);

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

	const commitDraft = useCallback(
		(nextValue: string) => {
			hasPendingLocalChangeRef.current = true;
			draftRef.current = nextValue;
			setDraft(nextValue);
			onChange(nextValue);
		},
		[onChange],
	);

	const insertTimestamp = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		const timestamp = timestampFormatter.format(new Date());
		const selectionStart = textarea.selectionStart;
		const selectionEnd = textarea.selectionEnd;
		const before = draftRef.current.slice(0, selectionStart);
		const after = draftRef.current.slice(selectionEnd);
		const insertion = `${before && !/\s$/.test(before) ? " " : ""}${timestamp}${after && !/^\s/.test(after) ? " " : ""}`;
		const nextValue = `${before}${insertion}${after}`;
		const nextSelection = selectionStart + insertion.length;

		commitDraft(nextValue);
		requestAnimationFrame(() => {
			textarea.focus({ preventScroll: true });
			textarea.setSelectionRange(nextSelection, nextSelection);
		});
	}, [commitDraft, timestampFormatter]);

	return (
		<div
			className="journal-editor-shell min-h-0 flex-1 overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)]"
			data-audio-versions-editor="journal"
		>
			<div
				className="flex shrink-0 items-center border-b border-[var(--color-border-plain)] px-3 py-2"
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
			{onInternalLink && journalLinks.length > 0 ? (
				<div className="flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--color-border-plain)] px-3 py-2">
					{journalLinks.map((link) => (
						<button
							key={link.href}
							type="button"
							className="surface-chip inline-flex h-8 max-w-72 shrink-0 items-center gap-2 px-3 text-xs font-semibold transition-colors hover:border-[var(--color-border-strong)]"
							aria-label={`Jump to ${link.label}`}
							title={link.href}
							onClick={() => onInternalLink(link.target)}
						>
							<Link2 size={14} className="shrink-0" />
							<span className="truncate">{link.label}</span>
						</button>
					))}
				</div>
			) : null}
			<textarea
				ref={textareaRef}
				value={draft}
				onChange={(event) => commitDraft(event.currentTarget.value)}
				className="journal-editor min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-4 py-4 text-base leading-7 text-[var(--color-text)] outline-none"
				aria-label="Song journal"
				placeholder="Write a note…"
				spellCheck
			/>
		</div>
	);
}
