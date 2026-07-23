import { Trash2 } from "lucide-react";
import { useRef } from "react";
import { resolveAudioFileSessionDateInputValue } from "#/lib/audio-versions/dates";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { SongModal } from "./song-modal";
import { useBufferedInputValue } from "./use-buffered-input-value";

interface SongWorkspaceFileDetailsDialogProps {
	audioFile: AudioFileRecord;
	deletingFile: boolean;
	onClose: () => void;
	onDeleteFile: () => Promise<void> | void;
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
}

export function SongWorkspaceFileDetailsDialog({
	audioFile,
	deletingFile,
	onClose,
	onDeleteFile,
	onUpdateFile,
}: SongWorkspaceFileDetailsDialogProps) {
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const title = useBufferedInputValue({
		value: audioFile.title,
		onCommit: (nextValue) =>
			onUpdateFile({
				title: nextValue,
			}),
	});
	const sessionDate = useBufferedInputValue({
		value: resolveAudioFileSessionDateInputValue(audioFile),
		onCommit: (nextValue) =>
			onUpdateFile({
				sessionDate: nextValue,
			}),
	});

	return (
		<SongModal
			title="File details"
			titleId="file-details-title"
			onClose={onClose}
			initialFocusRef={titleInputRef}
		>
			<div className="grid gap-4 p-5 sm:p-6">
				<label className="grid gap-2">
					<span className="field-label">File title</span>
					<input
						ref={titleInputRef}
						value={title.draft}
						onChange={(event) => title.setDraft(event.target.value)}
						onBlur={() => void title.flush()}
						className="field-input font-title"
						placeholder="Mix v3, ref print, master candidate..."
						aria-label="File title"
					/>
				</label>

				<label className="grid gap-2">
					<span className="field-label">File date</span>
					<input
						type="date"
						value={sessionDate.draft}
						onChange={(event) => sessionDate.setDraft(event.target.value)}
						onBlur={() => void sessionDate.flush()}
						className="field-input"
						aria-label="File date"
					/>
				</label>
			</div>

			<div className="flex items-center justify-end border-t border-[var(--color-border-plain)] px-5 py-4 sm:px-6">
				<button
					type="button"
					onClick={() => void onDeleteFile()}
					disabled={deletingFile}
					className="inline-flex h-11 items-center gap-2 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
				>
					<Trash2 size={15} />
					Delete file
				</button>
			</div>
		</SongModal>
	);
}
