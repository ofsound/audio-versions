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

function copyTextWithSelection(value: string): void {
	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";
	document.body.append(textarea);
	textarea.select();

	const didCopy = document.execCommand("copy");
	textarea.remove();

	if (!didCopy) {
		throw new Error("The clipboard is unavailable.");
	}
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
		try {
			await navigator.clipboard.write([
				new clipboardItemCtor({
					"text/html": new Blob([htmlPayload], { type: "text/html" }),
					"text/plain": new Blob([plainTextPayload], {
						type: "text/plain",
					}),
				}),
			]);
			return;
		} catch {
			// Chromium/Electron can expose the rich clipboard API while rejecting
			// HTML writes. Fall through to the more widely supported text path.
		}
	}

	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(plainTextPayload);
			return;
		} catch {
			// The selection fallback still works in desktop webviews where the
			// async clipboard permission is unavailable.
		}
	}

	copyTextWithSelection(plainTextPayload);
}
