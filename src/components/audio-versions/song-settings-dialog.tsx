import { Trash2 } from "lucide-react";
import { useRef } from "react";
import type { Song } from "#/lib/audio-versions/types";
import { SongModal } from "./song-modal";
import { useBufferedInputValue } from "./use-buffered-input-value";

interface SongSettingsDialogProps {
	song: Song;
	deletingSong: boolean;
	showArtist: boolean;
	showProject: boolean;
	onClose: () => void;
	onDeleteSong: () => Promise<void> | void;
	onUpdateSong: (patch: Partial<Song>) => Promise<void>;
}

export function SongSettingsDialog({
	song,
	deletingSong,
	showArtist,
	showProject,
	onClose,
	onDeleteSong,
	onUpdateSong,
}: SongSettingsDialogProps) {
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const title = useBufferedInputValue({
		value: song.title,
		onCommit: (nextValue) =>
			onUpdateSong({
				title: nextValue,
			}),
	});
	const artist = useBufferedInputValue({
		value: song.artist,
		onCommit: (nextValue) =>
			onUpdateSong({
				artist: nextValue,
			}),
	});
	const project = useBufferedInputValue({
		value: song.project,
		onCommit: (nextValue) =>
			onUpdateSong({
				project: nextValue,
			}),
	});

	return (
		<SongModal
			title="Song settings"
			titleId="song-settings-title"
			onClose={onClose}
			initialFocusRef={titleInputRef}
		>
			<div className="grid gap-4 p-5 sm:p-6">
				<label className="grid gap-2">
					<span className="field-label">Song title</span>
					<input
						ref={titleInputRef}
						value={title.draft}
						onChange={(event) => title.setDraft(event.target.value)}
						onBlur={() => void title.flush()}
						className="field-input font-title"
						placeholder="Song title"
						aria-label="Song title"
					/>
				</label>

				{showArtist ? (
					<label className="grid gap-2">
						<span className="field-label">Artist</span>
						<input
							value={artist.draft}
							onChange={(event) => artist.setDraft(event.target.value)}
							onBlur={() => void artist.flush()}
							className="field-input"
							placeholder="Artist"
							aria-label="Artist"
						/>
					</label>
				) : null}

				{showProject ? (
					<label className="grid gap-2">
						<span className="field-label">Project</span>
						<input
							value={project.draft}
							onChange={(event) => project.setDraft(event.target.value)}
							onBlur={() => void project.flush()}
							className="field-input"
							placeholder="Project"
							aria-label="Project"
						/>
					</label>
				) : null}
			</div>

			<div className="flex items-center justify-end border-t border-[var(--color-border-plain)] px-5 py-4 sm:px-6">
				<button
					type="button"
					onClick={() => void onDeleteSong()}
					disabled={deletingSong}
					className="inline-flex h-11 items-center gap-2 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
				>
					<Trash2 size={15} />
					Delete song
				</button>
			</div>
		</SongModal>
	);
}
