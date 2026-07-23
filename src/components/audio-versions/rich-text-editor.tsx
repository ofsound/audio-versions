import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link2,
	List,
	ListOrdered,
	Quote,
	Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import { parseSongTarget } from "#/lib/audio-versions/links";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import type { RichTextDoc, SongLinkTarget } from "#/lib/audio-versions/types";

interface RichTextEditorProps {
	value: RichTextDoc;
	onChange: (value: RichTextDoc) => void;
	onInternalLink?: (target: SongLinkTarget) => void;
	compact?: boolean;
	/** Further shrinks padding/min-height; only meaningful when `compact` is also set. */
	dense?: boolean;
	placeholder?: string;
	focusId?: string;
	/** When false, formatting toolbar is hidden (editor still supports rich content). */
	showToolbar?: boolean;
	/** When true, Escape blurs the editor (used in marker cards). */
	blurOnEscape?: boolean;
	/** When true, drops the wrapper border so the editor blends into its parent surface. */
	seamless?: boolean;
	commitDelayMs?: number;
}

export function RichTextEditor({
	value,
	onChange,
	onInternalLink,
	compact = false,
	dense = false,
	placeholder,
	focusId,
	showToolbar = true,
	blurOnEscape = false,
	seamless = false,
	commitDelayMs = DEBOUNCE_MS.editor,
}: RichTextEditorProps) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const scrollRegionRef = useRef<HTMLDivElement | null>(null);
	const serializedValue = useMemo(
		() => JSON.stringify(value ?? EMPTY_RICH_TEXT),
		[value],
	);
	const debounceRef = useRef<number | null>(null);
	const onChangeRef = useRef(onChange);
	const pendingLocalSerializedRef = useRef<string | null>(null);
	const flushPendingChangeRef = useRef<() => void>(() => {});
	const extensions = useMemo(
		() => [
			StarterKit.configure({
				heading: false,
				link: false,
			}),
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					class: "song-link",
				},
			}),
		],
		[],
	);
	const editorAttributes = useMemo(
		() => ({
			class: [
				"song-editor prose prose-sm max-w-none outline-none",
				compact
					? dense
						? "min-h-12 px-2 py-1.5 text-[13px]"
						: "min-h-28 px-3 py-3"
					: "min-h-44 px-4 py-4",
			].join(" "),
			"data-placeholder": placeholder ?? "",
		}),
		[compact, dense, placeholder],
	);

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	const emitChange = useCallback(
		(nextValue: RichTextDoc, nextSerializedValue: string) => {
			pendingLocalSerializedRef.current = nextSerializedValue;
			onChangeRef.current(nextValue);
		},
		[],
	);

	const editor = useEditor(
		{
			immediatelyRender: false,
			extensions,
			content: value ?? EMPTY_RICH_TEXT,
			editorProps: {
				attributes: editorAttributes,
			},
			onUpdate({ editor: currentEditor }) {
				if (debounceRef.current) {
					window.clearTimeout(debounceRef.current);
				}

				debounceRef.current = window.setTimeout(() => {
					const nextSerializedValue = JSON.stringify(currentEditor.getJSON());
					if (nextSerializedValue === serializedValue) {
						pendingLocalSerializedRef.current = null;
						return;
					}

					emitChange(
						currentEditor.getJSON() as RichTextDoc,
						nextSerializedValue,
					);
				}, commitDelayMs);
			},
		},
		[commitDelayMs, editorAttributes, emitChange, extensions],
	);

	const flushPendingChange = useCallback(() => {
		if (!editor) {
			return;
		}

		const nextSerializedValue = JSON.stringify(editor.getJSON());
		if (nextSerializedValue === serializedValue) {
			pendingLocalSerializedRef.current = null;
			if (debounceRef.current) {
				window.clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
			return;
		}

		if (debounceRef.current) {
			window.clearTimeout(debounceRef.current);
			debounceRef.current = null;
		}

		emitChange(editor.getJSON() as RichTextDoc, nextSerializedValue);
	}, [editor, emitChange, serializedValue]);

	useEffect(() => {
		flushPendingChangeRef.current = flushPendingChange;
	}, [flushPendingChange]);

	useEffect(() => {
		return () => {
			flushPendingChangeRef.current();
		};
	}, []);

	useEffect(() => {
		if (!editor) {
			return;
		}

		const currentSerialized = JSON.stringify(editor.getJSON());
		if (currentSerialized === serializedValue) {
			pendingLocalSerializedRef.current = null;
			return;
		}

		// While the editor has local work in flight, a lagging prop round-trip
		// must not overwrite the user's current text.
		if (debounceRef.current || pendingLocalSerializedRef.current) {
			return;
		}

		editor.commands.setContent(value ?? EMPTY_RICH_TEXT, {
			emitUpdate: false,
			parseOptions: { preserveWhitespace: "full" },
		});
	}, [editor, serializedValue, value]);

	useEffect(() => {
		if (!editor || !wrapperRef.current) {
			return;
		}

		const handleClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			const anchor = target.closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) {
				return;
			}

			const internalTarget = parseSongTarget(anchor.getAttribute("href"));
			if (internalTarget && onInternalLink) {
				event.preventDefault();
				onInternalLink(internalTarget);
				return;
			}

			event.preventDefault();
			window.open(anchor.href, "_blank", "noopener,noreferrer");
		};

		const node = wrapperRef.current;
		node.addEventListener("click", handleClick);
		return () => {
			node.removeEventListener("click", handleClick);
		};
	}, [editor, onInternalLink]);

	useEffect(() => {
		const node = wrapperRef.current;
		if (!node) {
			return;
		}

		const handleFocusOut = (event: FocusEvent) => {
			if (
				event.relatedTarget instanceof Node &&
				node.contains(event.relatedTarget)
			) {
				return;
			}

			flushPendingChange();
		};

		node.addEventListener("focusout", handleFocusOut);
		return () => {
			node.removeEventListener("focusout", handleFocusOut);
		};
	}, [flushPendingChange]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		const node = scrollRegionRef.current;
		if (!node) {
			return;
		}

		const handleMouseDown = (event: MouseEvent) => {
			if (!(event.target instanceof HTMLElement)) {
				return;
			}
			if (event.target.closest(".ProseMirror")) {
				return;
			}
			event.preventDefault();
			editor.commands.focus("end");
		};

		node.addEventListener("mousedown", handleMouseDown);
		return () => {
			node.removeEventListener("mousedown", handleMouseDown);
		};
	}, [editor]);

	if (!editor) {
		return (
			<div className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
				Loading editor...
			</div>
		);
	}

	return (
		<div
			ref={wrapperRef}
			className={`song-editor-shell min-h-0 bg-[var(--color-surface)]${
				seamless ? "" : " border border-[var(--color-border-strong)]"
			}`}
			data-audio-versions-editor={focusId}
			data-testid={focusId ? `rich-text-editor-${focusId}` : undefined}
		>
			{showToolbar ? (
				<div
					className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border-plain)] px-3 py-2"
					data-audio-versions-toolbar
				>
					<ToolbarButton
						label="Bold"
						active={editor.isActive("bold")}
						onClick={() => editor.chain().focus().toggleBold().run()}
					>
						<Bold size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Italic"
						active={editor.isActive("italic")}
						onClick={() => editor.chain().focus().toggleItalic().run()}
					>
						<Italic size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Bullets"
						active={editor.isActive("bulletList")}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
					>
						<List size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Numbers"
						active={editor.isActive("orderedList")}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
					>
						<ListOrdered size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Quote"
						active={editor.isActive("blockquote")}
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
					>
						<Quote size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Link"
						active={editor.isActive("link")}
						onClick={() => {
							const existing = editor.getAttributes("link").href as
								| string
								| undefined;
							const href = window.prompt(
								"Paste a URL or an internal Audio Versions link.",
								existing ?? "",
							);

							if (href === null) {
								return;
							}

							if (!href.trim()) {
								editor.chain().focus().unsetLink().run();
								return;
							}

							editor
								.chain()
								.focus()
								.extendMarkRange("link")
								.setLink({ href })
								.run();
						}}
					>
						<Link2 size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Remove link"
						active={false}
						onClick={() => editor.chain().focus().unsetLink().run()}
					>
						<Unlink size={15} />
					</ToolbarButton>
				</div>
			) : null}
			<div
				ref={scrollRegionRef}
				className="song-editor-scroll-region min-h-0 flex-1 overflow-hidden"
				onKeyDownCapture={(event) => {
					if (!blurOnEscape || event.key !== "Escape") {
						return;
					}
					event.preventDefault();
					editor.view.dom.blur();
				}}
			>
				<EditorContent editor={editor} />
			</div>
		</div>
	);
}

function ToolbarButton({
	label,
	active,
	onClick,
	children,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex h-8 items-center justify-center px-3 text-xs font-semibold ${
				active
					? "border-[var(--color-accent-strong)] bg-[var(--color-accent-surface)] text-[var(--color-text)]"
					: "action-secondary"
			}`}
			aria-label={label}
			title={label}
		>
			{children}
		</button>
	);
}
