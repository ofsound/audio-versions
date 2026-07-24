import { getAudioBlob } from "#/lib/audio-versions/db";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { getRemoteAudioUrl } from "#/lib/cloud/media";

export function extensionForAudioBlob(blob: Blob): string {
	const subtype = blob.type.split("/")[1]?.split(";")[0]?.replace("x-", "");
	return subtype?.replace(/[^a-zA-Z0-9]/g, "") || "audio";
}

export function resolveAudioDownloadFilename(
	audioFile: AudioFileRecord,
	blob?: Blob,
): string {
	const originalName = audioFile.remoteMedia?.originalName?.trim();
	if (originalName) {
		return originalName;
	}

	const extension = blob ? extensionForAudioBlob(blob) : "audio";
	const baseTitle = audioFile.title.trim() || "audio-file";
	return `${baseTitle}.${extension}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	anchor.rel = "noopener";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => {
		URL.revokeObjectURL(objectUrl);
	}, 0);
}

export async function downloadAudioFile({
	audioFile,
	blob,
}: {
	audioFile: AudioFileRecord;
	blob?: Blob;
}): Promise<void> {
	const storedBlob = await getAudioBlob(audioFile.id);
	const localBlob = storedBlob ?? blob;

	if (localBlob) {
		triggerBlobDownload(
			localBlob,
			resolveAudioDownloadFilename(audioFile, localBlob),
		);
		return;
	}

	if (!audioFile.remoteMedia) {
		throw new Error("This audio file is not available to download.");
	}

	const remoteUrl = await getRemoteAudioUrl(audioFile.id);
	const response = await fetch(remoteUrl);
	if (!response.ok) {
		throw new Error("Audio Versions could not download that audio file.");
	}

	const remoteBlob = await response.blob();
	triggerBlobDownload(
		remoteBlob,
		resolveAudioDownloadFilename(audioFile, remoteBlob),
	);
}
