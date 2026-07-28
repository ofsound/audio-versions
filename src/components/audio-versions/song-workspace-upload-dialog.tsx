import { Save } from "lucide-react";
import { useRef } from "react";
import { SongModal } from "./song-modal";

interface SongWorkspaceUploadDialogProps {
	uploadFile: File | null;
	uploadTitle: string;
	uploadNotes: string;
	uploadSessionDate: string;
	uploading: boolean;
	uploadError: string | null;
	onClose: () => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
	onFileChange: (file: File | null) => void;
	onUploadTitleChange: (value: string) => void;
	onUploadNotesChange: (value: string) => void;
	onUploadSessionDateChange: (value: string) => void;
}

export function SongWorkspaceUploadDialog({
	uploadFile,
	uploadTitle,
	uploadNotes,
	uploadSessionDate,
	uploading,
	uploadError,
	onClose,
	onSubmit,
	onFileChange,
	onUploadTitleChange,
	onUploadNotesChange,
	onUploadSessionDateChange,
}: SongWorkspaceUploadDialogProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	return (
		<SongModal
			title="Add file"
			titleId="upload-audio-title"
			onClose={onClose}
			initialFocusRef={fileInputRef}
			maxWidthClassName="max-w-[min(96rem,calc(100vw-2rem))]"
		>
			<form
				className="grid gap-4 p-5 sm:p-6"
				onSubmit={(event) => void onSubmit(event)}
			>
				<label className="grid gap-2">
					<span className="field-label">Audio file</span>
					<input
						ref={fileInputRef}
						type="file"
						accept="audio/*,.aif,.aiff,audio/aiff,audio/x-aiff"
						onChange={(event) => {
							onFileChange(event.target.files?.[0] ?? null);
						}}
						className="field-input py-3"
					/>
					{uploadFile ? (
						<p className="text-sm text-[var(--color-text-muted)]">
							Selected: {uploadFile.name}
						</p>
					) : null}
				</label>
				<label className="grid gap-2">
					<span className="field-label">Display title</span>
					<input
						value={uploadTitle}
						onChange={(event) => onUploadTitleChange(event.target.value)}
						className="field-input font-title"
					/>
				</label>
				<label className="grid gap-2">
					<span className="field-label">Notes</span>
					<textarea
						value={uploadNotes}
						onChange={(event) => onUploadNotesChange(event.target.value)}
						rows={3}
						className="field-input resize-y"
					/>
				</label>
				<label className="grid gap-2">
					<span className="field-label">Date</span>
					<input
						type="date"
						value={uploadSessionDate}
						onChange={(event) => onUploadSessionDateChange(event.target.value)}
						className="field-input"
					/>
				</label>
				<div className="flex flex-wrap items-center justify-end gap-3">
					<button
						type="submit"
						disabled={uploading || !uploadFile}
						className="action-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
					>
						<Save size={15} />
						{uploading ? "Importing audio..." : "Import into song"}
					</button>
				</div>
				{uploadError && (
					<div className="callout-danger px-4 py-3 text-sm">{uploadError}</div>
				)}
			</form>
		</SongModal>
	);
}
