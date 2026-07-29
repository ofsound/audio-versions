import type { Song } from "#/lib/audio-versions/types";

interface SongWorkspaceHeaderControlsProps {
	song: Song;
}

export function SongWorkspaceHeaderControls({
	song,
}: SongWorkspaceHeaderControlsProps) {
	return (
		<div className="song-workspace-header-controls flex min-w-0 flex-wrap items-end gap-x-8 gap-y-2">
			<h1 className="font-title song-workspace-title min-w-0 break-words text-4xl font-black leading-none tracking-[-0.04em] text-[var(--color-text)] sm:text-5xl [text-shadow:0_4px_18px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]">
				{song.title}
			</h1>
		</div>
	);
}
