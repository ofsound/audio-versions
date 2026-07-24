import { Upload } from "lucide-react";

interface SongWorkspaceFileDropzoneProps {
	active: boolean;
}

export function SongWorkspaceFileDropzone({
	active,
}: SongWorkspaceFileDropzoneProps) {
	if (!active) {
		return null;
	}

	return (
		<output
			className="song-workspace-file-dropzone"
			aria-live="polite"
			data-testid="song-workspace-file-dropzone"
		>
			<div className="song-workspace-file-dropzone__panel">
				<Upload size={28} aria-hidden="true" />
				<p className="font-title text-2xl font-semibold text-[var(--color-text)]">
					Drop audio to add to this song
				</p>
				<p className="text-sm text-[var(--color-text-muted)]">
					Release to open the import form with this file selected.
				</p>
			</div>
		</output>
	);
}
