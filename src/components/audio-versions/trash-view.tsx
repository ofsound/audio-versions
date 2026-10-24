import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAudioVersions } from "#/providers/audio-versions-provider";

export function TrashView() {
	const { ready, trashedSongs, permanentlyDeleteSong, restoreSong } =
		useAudioVersions();
	const [processingSongId, setProcessingSongId] = useState<string | null>(null);
	const [emptying, setEmptying] = useState(false);

	async function handleRestoreSong(songId: string) {
		setProcessingSongId(songId);
		try {
			await restoreSong(songId);
		} finally {
			setProcessingSongId((current) => (current === songId ? null : current));
		}
	}

	async function handlePermanentlyDeleteSong(songId: string) {
		if (
			!window.confirm(
				"Permanently delete this song and all of its audio files? This cannot be undone.",
			)
		) {
			return;
		}

		setProcessingSongId(songId);
		try {
			await permanentlyDeleteSong(songId);
		} finally {
			setProcessingSongId((current) => (current === songId ? null : current));
		}
	}

	async function handleEmptyTrash() {
		if (
			!window.confirm(
				`Permanently delete all ${trashedSongs.length} trashed songs and their audio files? This cannot be undone.`,
			)
		) {
			return;
		}

		setEmptying(true);
		try {
			for (const song of trashedSongs) {
				await permanentlyDeleteSong(song.id);
			}
		} finally {
			setEmptying(false);
		}
	}

	const orderedSongs = [...trashedSongs].sort((left, right) =>
		(right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""),
	);

	return (
		<main className="mx-auto w-full max-w-[1500px] px-3 py-6">
			<section className="panel-shell panel-shell--plain overflow-hidden">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-plain)] p-4 sm:p-6">
					<div>
						<div className="flex items-center gap-2">
							<Trash2 size={19} className="text-[var(--color-accent)]" />
							<h1 className="font-title text-xl font-semibold">Trash</h1>
						</div>
						<p className="mt-2 text-sm text-[var(--color-text-muted)]">
							Songs and audio are permanently deleted after 30 days.
						</p>
					</div>
					{ready && orderedSongs.length > 0 ? (
						<button
							type="button"
							disabled={emptying}
							onClick={() => void handleEmptyTrash()}
							className="inline-flex h-10 items-center gap-2 border border-[var(--color-danger-border)] px-3 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-50"
						>
							<Trash2 size={14} /> {emptying ? "Emptying..." : "Empty Trash"}
						</button>
					) : null}
				</div>

				{!ready ? (
					<div className="flex min-h-64 items-center justify-center px-6 text-sm text-[var(--color-text-muted)]">
						Loading Trash...
					</div>
				) : orderedSongs.length === 0 ? (
					<div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-[var(--color-text-muted)]">
						Trash is empty.
					</div>
				) : (
					<div className="grid gap-3 p-4 sm:p-6">
						{orderedSongs.map((song) => {
							const deletionDate = new Date(
								Date.parse(song.deletedAt ?? "") + 30 * 24 * 60 * 60 * 1000,
							);
							const busy = emptying || processingSongId === song.id;

							return (
								<div
									key={song.id}
									className="flex flex-col gap-3 border border-[var(--color-border-plain)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="min-w-0">
										<h2 className="truncate font-semibold text-[var(--color-text)]">
											{song.title}
										</h2>
										<p className="mt-1 text-sm text-[var(--color-text-muted)]">
											Permanently deletes{" "}
											{deletionDate.toLocaleDateString(undefined, {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</p>
									</div>
									<div className="flex shrink-0 flex-wrap gap-2">
										<button
											type="button"
											disabled={busy}
											onClick={() => void handleRestoreSong(song.id)}
											className="inline-flex h-10 items-center gap-2 border border-[var(--color-border-strong)] px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
										>
											<RotateCcw size={14} /> Restore
										</button>
										<button
											type="button"
											disabled={busy}
											onClick={() => void handlePermanentlyDeleteSong(song.id)}
											className="inline-flex h-10 items-center gap-2 border border-[var(--color-danger-border)] px-3 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-50"
										>
											<Trash2 size={14} /> Delete permanently
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</section>
		</main>
	);
}
