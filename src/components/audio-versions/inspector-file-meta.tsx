import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	downloadAudioFile,
	resolveAudioDownloadFilename,
} from "#/lib/audio-versions/download-audio-file";
import type { AudioFileRecord } from "#/lib/audio-versions/types";

interface InspectorFileMetaProps {
	selectedFile: AudioFileRecord;
	blob?: Blob;
	deletingFile: boolean;
	onDeleteFile: () => void;
}

export function InspectorFileMeta({
	selectedFile,
	blob,
	deletingFile,
	onDeleteFile,
}: InspectorFileMetaProps) {
	const filename = resolveAudioDownloadFilename(selectedFile, blob);
	const canDownloadFile = Boolean(blob || selectedFile.remoteMedia);
	const [downloadingFile, setDownloadingFile] = useState(false);

	async function handleDownloadFile() {
		if (!canDownloadFile || downloadingFile) {
			return;
		}

		setDownloadingFile(true);
		try {
			await downloadAudioFile({
				audioFile: selectedFile,
				blob,
			});
		} catch (error) {
			window.alert(
				error instanceof Error
					? error.message
					: "Audio Versions could not download that audio file.",
			);
		} finally {
			setDownloadingFile(false);
		}
	}

	return (
		<div className="flex w-full min-w-0 items-center gap-1.5">
			<span
				className="min-w-0 flex-1 truncate text-base text-[var(--color-text-muted)]"
				title={filename}
			>
				{filename}
			</span>
			<button
				type="button"
				onClick={() => {
					void handleDownloadFile();
				}}
				disabled={!canDownloadFile || downloadingFile}
				className="icon-button icon-button--sm shrink-0 disabled:cursor-not-allowed disabled:opacity-55"
				title="Download file"
				aria-label={`Download ${selectedFile.title}`}
			>
				<Download size={12} />
			</button>
			<button
				type="button"
				onClick={onDeleteFile}
				disabled={deletingFile}
				className="icon-button icon-button--sm shrink-0 text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
				title="Delete file"
				aria-label={`Delete ${selectedFile.title}`}
			>
				<Trash2 size={12} />
			</button>
		</div>
	);
}
