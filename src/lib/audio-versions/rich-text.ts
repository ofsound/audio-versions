import type { RichTextDoc, RichTextNode } from "./types";

export const EMPTY_RICH_TEXT: RichTextDoc = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [],
		},
	],
};

export function normalizeRichText(value?: RichTextDoc | null): RichTextDoc {
	if (!value || value.type !== "doc") {
		return EMPTY_RICH_TEXT;
	}

	return value;
}

export function plainTextToRichText(value: string): RichTextDoc {
	const trimmed = value.trim();
	if (!trimmed) {
		return EMPTY_RICH_TEXT;
	}

	return {
		type: "doc",
		content: trimmed.split(/\n{2,}/).map((paragraph) => ({
			type: "paragraph",
			content: paragraph
				.split("\n")
				.filter(Boolean)
				.flatMap((line, index) => {
					const nodes: RichTextNode[] = [{ type: "text", text: line }];
					if (index < paragraph.split("\n").filter(Boolean).length - 1) {
						nodes.push({ type: "hardBreak" });
					}
					return nodes;
				}),
		})),
	};
}

export function richTextToPlainText(value?: RichTextDoc | null): string {
	return collectText(normalizeRichText(value)).replace(/\s+/g, " ").trim();
}

export function richTextToMultiline(value?: RichTextDoc | null): string {
	return collectText(normalizeRichText(value), true)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function richTextPreview(
	value?: RichTextDoc | null,
	fallback = "No notes yet.",
): string {
	const text = richTextToPlainText(value);
	if (!text) {
		return fallback;
	}

	return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function hasRichTextContent(value?: RichTextDoc | null): boolean {
	return richTextToPlainText(value).length > 0;
}

function collectText(
	node: RichTextDoc | RichTextNode,
	preserveBreaks = false,
): string {
	if ("text" in node && typeof node.text === "string") {
		return node.text;
	}

	const pieces = (node.content ?? []).map((child) =>
		collectText(child, preserveBreaks),
	);
	const joiner =
		preserveBreaks &&
		(node.type === "paragraph" ||
			node.type === "heading" ||
			node.type === "blockquote")
			? "\n"
			: " ";

	if (node.type === "hardBreak") {
		return "\n";
	}

	return pieces.join(joiner);
}
