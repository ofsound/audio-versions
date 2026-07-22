import { buildSongTargetPath } from "./links";
import type { SongLinkTarget } from "./types";

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export async function copySongTargetLink(
	target: SongLinkTarget,
	label: string,
): Promise<void> {
	const relativePath = buildSongTargetPath(target);
	const absoluteUrl =
		typeof window !== "undefined"
			? `${window.location.origin}${relativePath}`
			: relativePath;
	const plainTextPayload = `${label}\n${absoluteUrl}`;
	const htmlPayload = `<a href="${escapeHtml(absoluteUrl)}">${escapeHtml(label)}</a>`;

	const clipboardItemCtor = (
		globalThis as {
			ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem;
		}
	).ClipboardItem;

	if (navigator.clipboard?.write && clipboardItemCtor) {
		await navigator.clipboard.write([
			new clipboardItemCtor({
				"text/html": new Blob([htmlPayload], { type: "text/html" }),
				"text/plain": new Blob([plainTextPayload], { type: "text/plain" }),
			}),
		]);
		return;
	}

	await navigator.clipboard.writeText(plainTextPayload);
}
