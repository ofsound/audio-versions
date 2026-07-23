import { Upload } from "lucide-react";
import type { Song } from "#/lib/audio-versions/types";

interface SongWorkspaceHeaderControlsProps {
	song: Song;
	onOpenUpload: () => void;
}

export function SongWorkspaceHeaderControls({
	song,
	onOpenUpload,
}: SongWorkspaceHeaderControlsProps) {
	return (
		<div className="song-workspace-header-controls flex min-w-0 flex-wrap items-end gap-x-8 gap-y-2">
			<h1 className="font-title song-workspace-title min-w-0 break-words text-4xl font-black leading-none tracking-[-0.04em] text-[var(--color-text)] sm:text-5xl [text-shadow:0_4px_18px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]">
				{song.title}
			</h1>
			<button
				type="button"
				onClick={onOpenUpload}
				className="song-workspace-add-file action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-sm font-semibold leading-none"
			>
				<Upload size={16} />
				Add file
			</button>
		</div>
	);
}
