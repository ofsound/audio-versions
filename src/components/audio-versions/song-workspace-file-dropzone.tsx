import { Upload } from "lucide-react";

interface SongWorkspaceFileDropzoneProps {
	active: boolean;
	target?: "audio" | "song" | "file";
}

export function SongWorkspaceFileDropzone({
	active,
	target = "audio",
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
				<Upload size={20} aria-hidden="true" />
				<p className="font-title text-lg font-semibold text-[var(--color-text)]">
					{target === "audio"
						? "Drop audio to add to this song"
						: target === "song"
							? "Drop images into Song gallery"
							: "Drop images into File gallery"}
				</p>
				<p className="text-sm text-[var(--color-text-muted)]">
					Drop audio over tracks · Images over Song Notes or file notes.
				</p>
			</div>
		</output>
	);
}
