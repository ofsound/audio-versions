import { Clock3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface JournalEditorProps {
	value: string;
	onChange: (value: string) => void;
}

export function JournalEditor({ value, onChange }: JournalEditorProps) {
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
			<textarea
				ref={textareaRef}
				value={draft}
				onChange={(event) => commitDraft(event.currentTarget.value)}
				className="journal-editor min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-4 py-4 text-base leading-7 text-[var(--color-text-muted)] outline-none"
				aria-label="Song journal"
				placeholder="Write a note…"
				spellCheck
			/>
		</div>
	);
}
