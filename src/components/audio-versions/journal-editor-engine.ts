import {
	defaultKeymap,
	deleteCharBackward,
	deleteCharForward,
	history,
	isolateHistory,
	redo,
	undo,
} from "@codemirror/commands";
import { search, searchKeymap, selectNextOccurrence } from "@codemirror/search";
import {
	Annotation,
	EditorSelection,
	EditorState,
	type Range,
	StateField,
	Transaction,
} from "@codemirror/state";
import {
	crosshairCursor,
	Decoration,
	type DecorationSet,
	drawSelection,
	dropCursor,
	EditorView,
	keymap,
	rectangularSelection,
	WidgetType,
} from "@codemirror/view";
import { parseSongTarget } from "#/lib/audio-versions/links";
import type { SongLinkTarget } from "#/lib/audio-versions/types";
import { formatDuration } from "#/lib/audio-versions/waveform";

export const externalJournalUpdate = Annotation.define<boolean>();
interface Atom {
	from: number;
	to: number;
	label: string;
	target?: SongLinkTarget;
	source: string;
}

class JournalChip extends WidgetType {
	constructor(
		readonly atom: Atom,
		readonly selected: boolean,
	) {
		super();
	}
	eq(other: JournalChip) {
		return (
			this.atom.from === other.atom.from &&
			this.atom.to === other.atom.to &&
			this.atom.source === other.atom.source &&
			this.selected === other.selected
		);
	}
	toDOM() {
		const chip = document.createElement("span");
		const timestamp = !this.atom.target;
		chip.className = `journal-link-chip surface-chip ${timestamp ? "journal-timestamp-chip" : ""}`;
		chip.setAttribute("contenteditable", "false");
		chip.setAttribute("role", "button");
		chip.tabIndex = 0;
		chip.dataset.journalFrom = String(this.atom.from);
		chip.dataset.journalTo = String(this.atom.to);
		chip.dataset.journalSource = this.atom.source;
		chip.setAttribute(
			"aria-label",
			`${timestamp ? "Timestamp" : "Jump to"} ${this.atom.label}`,
		);
		chip.title = timestamp
			? "Click to select, then Delete or Backspace to remove"
			: "Click to open this song or marker";
		if (this.selected) chip.dataset.journalSelected = "true";
		const icon = document.createElement("span");
		icon.className = timestamp ? "journal-timestamp-icon" : "journal-link-icon";
		icon.setAttribute("aria-hidden", "true");
		const label = document.createElement("span");
		label.className = "journal-link-label";
		label.textContent = this.atom.label;
		chip.append(icon, label);
		if (typeof this.atom.target?.timeMs === "number") {
			const time = document.createElement("span");
			time.className = "journal-link-time";
			time.textContent = formatDuration(this.atom.target.timeMs);
			chip.append(time);
		}
		return chip;
	}
	ignoreEvent() {
		return false;
	}
}

function journalAtoms(state: EditorState): Atom[] {
	const text = state.doc.toString();
	const atoms: Atom[] = [];
	for (const match of text.matchAll(
		/\{\{timestamp:([^}\n]+)\}\}|(?:https?:\/\/[^\s]+|\/songs\/[^\s]+)/g,
	)) {
		if (match[1]) {
			atoms.push({
				from: match.index,
				to: match.index + match[0].length,
				label: match[1],
				source: match[0],
			});
			continue;
		}
		const href = match[0].replace(/[),.;!?]+$/, "");
		const target = parseSongTarget(href);
		if (!target) continue;
		const line = state.doc.lineAt(match.index);
		const previous = line.number > 1 ? state.doc.line(line.number - 1) : null;
		const useLabel =
			line.text.trim() === match[0] &&
			previous?.text.trim() &&
			!/(https?:\/\/|\/songs\/)/.test(previous.text);
		const from = useLabel && previous ? previous.from : match.index;
		atoms.push({
			from,
			to: match.index + href.length,
			label:
				useLabel && previous
					? previous.text
					: target.annotationId
						? "Marker link"
						: "Song link",
			target,
			source: text.slice(from, match.index + href.length),
		});
	}
	return atoms;
}

function decorateJournal(state: EditorState): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const atoms = journalAtoms(state);
	for (const atom of atoms) {
		const selected = state.selection.ranges.some(
			(range) => range.from === atom.from && range.to === atom.to,
		);
		decorations.push(
			Decoration.replace({ widget: new JournalChip(atom, selected) }).range(
				atom.from,
				atom.to,
			),
		);
	}
	for (const match of state.doc
		.toString()
		.matchAll(/\*\*[^*\n]*?\*\*|_[^_\n]*?_/g)) {
		const from = match.index,
			to = from + match[0].length;
		if (atoms.some((atom) => from >= atom.from && from < atom.to)) continue;
		const bold = match[0].startsWith("**"),
			size = bold ? 2 : 1;
		decorations.push(
			Decoration.replace({}).range(from, from + size),
			Decoration.replace({}).range(to - size, to),
		);
		if (to - from > size * 2)
			decorations.push(
				Decoration.mark({ tagName: bold ? "strong" : "em" }).range(
					from + size,
					to - size,
				),
			);
	}
	return Decoration.set(decorations, true);
}
const journalDecorations = StateField.define<DecorationSet>({
	create: decorateJournal,
	update: (value, tr) =>
		tr.docChanged || tr.selection ? decorateJournal(tr.state) : value,
	provide: (field) => [
		EditorView.decorations.from(field),
		EditorView.atomicRanges.of((view) =>
			view.state.field(field).update({
				filter: (_from, _to, decoration) => !decoration.spec.tagName,
			}),
		),
	],
});

export function toggleJournalFormat(view: EditorView, marker: "**" | "_") {
	const spec = view.state.changeByRange((range) => {
		const text = view.state.sliceDoc(range.from, range.to),
			size = marker.length;
		if (
			text.length >= size * 2 &&
			text.startsWith(marker) &&
			text.endsWith(marker)
		) {
			const inner = text.slice(size, -size);
			return {
				changes: { from: range.from, to: range.to, insert: inner },
				range: EditorSelection.range(
					range.from + (range.anchor === range.from ? 0 : inner.length),
					range.from + (range.head === range.from ? 0 : inner.length),
				),
			};
		}
		const wrapped =
			view.state.sliceDoc(Math.max(0, range.from - size), range.from) ===
				marker && view.state.sliceDoc(range.to, range.to + size) === marker;
		if (wrapped)
			return {
				changes: [
					{ from: range.from - size, to: range.from },
					{ from: range.to, to: range.to + size },
				],
				range: EditorSelection.range(range.anchor - size, range.head - size),
			};
		return {
			changes: {
				from: range.from,
				to: range.to,
				insert: `${marker}${text}${marker}`,
			},
			range: EditorSelection.range(range.anchor + size, range.head + size),
		};
	});
	view.dispatch({
		...spec,
		annotations: [
			Transaction.userEvent.of("input.format"),
			isolateHistory.of("full"),
		],
		scrollIntoView: true,
	});
	return true;
}

/** Also handles a timestamp on the preceding/following otherwise empty line. */
function deleteJournalAtom(view: EditorView, backward: boolean): boolean {
	if (view.state.selection.ranges.length > 1) return false;
	const atoms = journalAtoms(view.state);
	const spec = view.state.changeByRange((range) => {
		if (!range.empty) return { range };
		const atom = atoms.find((atom) => {
			if (
				atom.target ||
				(backward ? atom.to > range.from : atom.from < range.to)
			)
				return false;
			let from = atom.from,
				to = atom.to;
			if (
				view.state.sliceDoc(Math.max(0, from - 2), from) === "**" &&
				view.state.sliceDoc(to, to + 2) === "**"
			) {
				from -= 2;
				to += 2;
			}
			if (backward ? to > range.from : from < range.to) return false;
			return /^\n?$/.test(
				backward
					? view.state.sliceDoc(to, range.from)
					: view.state.sliceDoc(range.to, from),
			);
		});
		if (!atom) return { range };
		let from = atom.from,
			to = atom.to;
		if (
			view.state.sliceDoc(Math.max(0, from - 2), from) === "**" &&
			view.state.sliceDoc(to, to + 2) === "**"
		) {
			from -= 2;
			to += 2;
		}
		return {
			changes: { from, to },
			range: EditorSelection.cursor(
				backward ? range.from - (to - from) : range.from,
			),
		};
	});
	if (spec.changes.empty) return false;
	// Mixed selections must receive the ordinary deletion too. Let CodeMirror
	// handle that case, rather than silently ignoring some cursors.
	if (view.state.selection.ranges.some((range) => !range.empty)) return false;
	view.dispatch({
		...spec,
		annotations: [
			Transaction.userEvent.of("delete"),
			isolateHistory.of("full"),
		],
	});
	return true;
}

function deleteJournalCharacter(view: EditorView, backward: boolean): boolean {
	if (deleteJournalAtom(view, backward)) return true;
	const formats = [
		...view.state.doc.toString().matchAll(/\*\*[^*\n]*?\*\*|_[^_\n]*?_/g),
	];
	let changed = false;
	const ranges = view.state.selection.ranges.map((range) => {
		if (!range.empty) return range;
		for (const match of formats) {
			const from = match.index,
				to = from + match[0].length,
				size = match[0].startsWith("**") ? 2 : 1;
			if (
				to - from === size * 2 &&
				(backward
					? range.head > from && range.head <= to
					: range.head >= from && range.head < to)
			) {
				changed = true;
				return EditorSelection.range(from, to);
			}
			if (backward ? range.head === to : range.head === from) {
				changed = true;
				return EditorSelection.cursor(backward ? to - size : from + size);
			}
		}
		return range;
	});
	if (changed)
		view.dispatch({
			selection: EditorSelection.create(ranges, view.state.selection.mainIndex),
		});
	return (backward ? deleteCharBackward : deleteCharForward)(view);
}

interface JournalCallbacks {
	onInternalLink?: (target: SongLinkTarget) => void;
	onLocalHistoryAction?: (action: "undo" | "redo") => void;
}
export function journalExtensions(callbacks: () => JournalCallbacks) {
	const historyCommand = (action: "undo" | "redo") => (view: EditorView) => {
		const handled = (action === "undo" ? undo : redo)(view);
		if (handled) callbacks().onLocalHistoryAction?.(action);
		return handled;
	};
	let altClick: { selection: EditorSelection; x: number; y: number } | null =
		null;
	const chipFrom = (event: Event) =>
		event.target instanceof Element
			? event.target.closest<HTMLElement>("[data-journal-from]")
			: null;
	const selectChip = (chip: HTMLElement, view: EditorView) => {
		view.focus();
		view.dispatch({
			selection: EditorSelection.range(
				Number(chip.dataset.journalFrom),
				Number(chip.dataset.journalTo),
			),
		});
	};
	return [
		EditorState.allowMultipleSelections.of(true),
		drawSelection(),
		dropCursor(),
		rectangularSelection(),
		crosshairCursor(),
		EditorView.clickAddsSelectionRange.of((event) => event.metaKey),
		EditorView.lineWrapping,
		history({ newGroupDelay: 750 }),
		journalDecorations,
		search({ top: true }),
		keymap.of([
			{
				key: "Mod-z",
				run: historyCommand("undo"),
				shift: historyCommand("redo"),
			},
			{ key: "Mod-y", run: historyCommand("redo") },
			{ key: "Mod-b", run: (view) => toggleJournalFormat(view, "**") },
			{ key: "Mod-i", run: (view) => toggleJournalFormat(view, "_") },
			{ key: "Mod-d", run: selectNextOccurrence },
			{
				key: "Backspace",
				run: (view) => deleteJournalCharacter(view, true),
			},
			{
				key: "Delete",
				run: (view) => deleteJournalCharacter(view, false),
			},
			...searchKeymap,
			...defaultKeymap,
		]),
		EditorView.domEventHandlers({
			mousedown(event, view) {
				altClick =
					event.altKey && event.button === 0
						? {
								selection: view.state.selection,
								x: event.clientX,
								y: event.clientY,
							}
						: null;
				const chip = chipFrom(event);
				if (!chip || event.altKey || event.metaKey || event.shiftKey)
					return false;
				event.preventDefault();
				const atom = journalAtoms(view.state).find(
					(atom) => atom.from === Number(chip.dataset.journalFrom),
				);
				if (!atom?.target) selectChip(chip, view);
				return true;
			},
			click(event, view) {
				const previous = altClick;
				altClick = null;
				if (
					event.altKey &&
					previous &&
					Math.abs(event.clientX - previous.x) < 3 &&
					Math.abs(event.clientY - previous.y) < 3
				) {
					view.dispatch({
						selection: EditorSelection.create([
							...previous.selection.ranges,
							...view.state.selection.ranges,
						]),
					});
					return true;
				}
				const chip = chipFrom(event);
				if (!chip || event.altKey || event.metaKey) return false;
				event.preventDefault();
				const atom = journalAtoms(view.state).find(
					(atom) => atom.from === Number(chip.dataset.journalFrom),
				);
				if (atom?.target) callbacks().onInternalLink?.(atom.target);
				else selectChip(chip, view);
				return true;
			},
			keydown(event, view) {
				const chip = chipFrom(event);
				if (!chip) return false;
				if (event.key === "Backspace" || event.key === "Delete") {
					event.preventDefault();
					const from = Number(chip.dataset.journalFrom),
						to = Number(chip.dataset.journalTo);
					view.focus();
					view.dispatch({
						changes: { from, to },
						selection: { anchor: from },
						annotations: [
							Transaction.userEvent.of("delete"),
							isolateHistory.of("full"),
						],
					});
					return true;
				}
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					const atom = journalAtoms(view.state).find(
						(atom) => atom.from === Number(chip.dataset.journalFrom),
					);
					if (atom?.target) callbacks().onInternalLink?.(atom.target);
					else selectChip(chip, view);
					return true;
				}
				return false;
			},
		}),
		EditorView.contentAttributes.of({
			"aria-label": "Song notes",
			spellcheck: "true",
			autocapitalize: "sentences",
		}),
	];
}

export function insertJournalTimestamp(view: EditorView, label: string) {
	const spec = view.state.changeByRange((range) => {
		const before = view.state.sliceDoc(Math.max(0, range.from - 1), range.from),
			after = view.state.sliceDoc(range.to, range.to + 1);
		const insert = `${before && !/\s/.test(before) ? " " : ""}{{timestamp:${label}}}${after && !/\s/.test(after) ? " " : ""}`;
		return {
			changes: { from: range.from, to: range.to, insert },
			range: EditorSelection.cursor(range.from + insert.length),
		};
	});
	view.dispatch({
		...spec,
		annotations: [
			Transaction.userEvent.of("input.timestamp"),
			isolateHistory.of("full"),
		],
	});
	view.focus();
}
