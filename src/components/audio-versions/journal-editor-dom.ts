export interface JournalSelection {
	anchor: number;
	focus: number;
}

interface SourceNode {
	node: Node;
	start: number;
	end: number;
	atomic: boolean;
}

function journalDocument(root: HTMLElement) {
	let source = "";
	const nodes: SourceNode[] = [];
	const visit = (node: Node) => {
		const start = source.length;
		let atomic = false;
		if (node.nodeType === Node.TEXT_NODE) {
			source += node.textContent ?? "";
		} else if (node instanceof HTMLElement) {
			const token = node.dataset.journalSource;
			if (token !== undefined) {
				source += token;
				atomic = true;
			} else if (node.tagName === "BR") {
				// A sole BR is a browser's empty paragraph placeholder.
				if (node.parentNode?.childNodes.length !== 1) source += "\n";
			} else {
				const marker = /^(STRONG|B)$/.test(node.tagName)
					? "**"
					: /^(EM|I)$/.test(node.tagName)
						? "_"
						: "";
				source += marker;
				Array.from(node.childNodes).forEach(visit);
				source += marker;
			}
		}
		nodes.push({ node, start, end: source.length, atomic });
	};
	Array.from(root.childNodes).forEach((node, index) => {
		const isBlock = (candidate: Node | undefined) =>
			candidate instanceof HTMLElement &&
			/^(DIV|P|LI)$/.test(candidate.tagName);
		if (index > 0 && (isBlock(node) || isBlock(root.childNodes[index - 1])))
			source += "\n";
		visit(node);
	});
	return { source, nodes };
}

export function readJournal(root: HTMLElement): string {
	return journalDocument(root).source;
}

export function captureJournalSelection(
	root: HTMLElement,
): JournalSelection | null {
	const selection = window.getSelection();
	if (
		!selection?.anchorNode ||
		!selection.focusNode ||
		!root.contains(selection.anchorNode) ||
		!root.contains(selection.focusNode)
	)
		return null;
	const { source, nodes } = journalDocument(root);
	const offset = (node: Node, index: number) => {
		if (node === root) {
			return index >= root.childNodes.length
				? source.length
				: (nodes.find((entry) => entry.node === root.childNodes[index])
						?.start ?? 0);
		}
		const entry = nodes.find((entry) => entry.node === node);
		if (!entry) return 0;
		if (node.nodeType === Node.TEXT_NODE)
			return Math.min(entry.end, entry.start + index);
		const child = node.childNodes[index];
		return child
			? (nodes.find((entry) => entry.node === child)?.start ?? entry.start)
			: entry.end;
	};
	return {
		anchor: offset(selection.anchorNode, selection.anchorOffset),
		focus: offset(selection.focusNode, selection.focusOffset),
	};
}

export function restoreJournalSelection(
	root: HTMLElement,
	saved: JournalSelection,
) {
	const { nodes, source } = journalDocument(root);
	const point = (offset: number): [Node, number] => {
		const position = Math.max(0, Math.min(offset, source.length));
		for (const entry of nodes) {
			if (position < entry.start || position > entry.end) continue;
			if (entry.node.nodeType === Node.TEXT_NODE)
				return [entry.node, position - entry.start];
			if (entry.node instanceof HTMLBRElement && entry.node.parentNode) {
				return [
					entry.node.parentNode,
					Array.from(entry.node.parentNode.childNodes).indexOf(entry.node),
				];
			}
			if (entry.atomic && entry.node.parentNode) {
				const index = Array.from(entry.node.parentNode.childNodes).indexOf(
					entry.node as ChildNode,
				);
				return [
					entry.node.parentNode,
					index + (position > entry.start ? 1 : 0),
				];
			}
		}
		return [root, root.childNodes.length];
	};
	const [anchor, anchorOffset] = point(saved.anchor);
	const [focus, focusOffset] = point(saved.focus);
	window
		.getSelection()
		?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

/** Restore only after a programmatic document rewrite, never during native typing. */
export function captureJournalViewport(root: HTMLElement) {
	const positions: { element: HTMLElement; top: number; left: number }[] = [];
	for (
		let element: HTMLElement | null = root;
		element;
		element = element.parentElement
	) {
		positions.push({
			element,
			top: element.scrollTop,
			left: element.scrollLeft,
		});
	}
	return () => {
		for (const { element, top, left } of positions) {
			if (element.scrollTop !== top) element.scrollTop = top;
			if (element.scrollLeft !== left) element.scrollLeft = left;
		}
	};
}
