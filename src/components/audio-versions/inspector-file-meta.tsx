import { Download, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	resolveAudioFileSessionDateInputValue,
	resolveAudioFileSessionDateLabel,
} from "#/lib/audio-versions/dates";
import { downloadAudioFile } from "#/lib/audio-versions/download-audio-file";
import type { AudioFileRecord } from "#/lib/audio-versions/types";

interface InspectorFileMetaProps {
	selectedFile: AudioFileRecord;
	blob?: Blob;
	deletingFile: boolean;
	onDeleteFile: () => void;
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
}

export function InspectorFileMeta({
	selectedFile,
	blob,
	deletingFile,
	onDeleteFile,
	onUpdateFile,
}: InspectorFileMetaProps) {
	const sessionDateIso = resolveAudioFileSessionDateInputValue(selectedFile);
	const sessionDateLabel = resolveAudioFileSessionDateLabel(selectedFile);
	const canDownloadFile = Boolean(blob || selectedFile.remoteMedia);
	const [editingDate, setEditingDate] = useState(false);
	const [draftDate, setDraftDate] = useState(sessionDateIso);
	const [downloadingFile, setDownloadingFile] = useState(false);
	const dateInputRef = useRef<HTMLInputElement | null>(null);
	const skipCommitRef = useRef(false);

	useEffect(() => {
		if (!editingDate) {
			setDraftDate(sessionDateIso);
		}
	}, [editingDate, sessionDateIso]);

	useEffect(() => {
		if (editingDate) {
			dateInputRef.current?.focus();
		}
	}, [editingDate]);

	function commitDate() {
		if (skipCommitRef.current) {
			skipCommitRef.current = false;
			return;
		}

		const nextDate = draftDate;
		setEditingDate(false);
		if (nextDate === sessionDateIso) {
			return;
		}

		void onUpdateFile({ sessionDate: nextDate });
	}

	function cancelDate() {
		skipCommitRef.current = true;
		setDraftDate(sessionDateIso);
		setEditingDate(false);
	}

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
		<div className="flex w-fit max-w-full items-center gap-1.5">
			{editingDate ? (
				<input
					ref={dateInputRef}
					type="date"
					value={draftDate}
					onChange={(event) => setDraftDate(event.target.value)}
					onBlur={() => commitDate()}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
							return;
						}

						if (event.key === "Escape") {
							event.preventDefault();
							cancelDate();
						}
					}}
					className="field-input field-input--compact w-auto max-w-[11rem] text-base"
					aria-label="File date"
				/>
			) : (
				<button
					type="button"
					onDoubleClick={(event) => {
						event.preventDefault();
						setEditingDate(true);
					}}
					className="w-fit whitespace-nowrap text-left text-base tabular-nums text-[var(--color-text-muted)]"
					title="Double-click to edit date"
				>
					{sessionDateLabel}
				</button>
			)}
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
