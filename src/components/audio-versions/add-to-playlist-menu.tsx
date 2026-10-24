import { Check, ListPlus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAudioVersions } from "#/providers/audio-versions-provider";

export function AddToPlaylistMenu({
	audioFileId,
	audioFileTitle,
}: {
	audioFileId: string;
	audioFileTitle: string;
}) {
	const {
		playlists,
		addAudioFileToPlaylist,
		createPlaylist,
		removeAudioFileFromPlaylist,
	} = useAudioVersions();
	const [isOpen, setIsOpen] = useState(false);
	const [newPlaylistName, setNewPlaylistName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);
	const [position, setPosition] = useState({ top: 0, right: 0 });
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const orderedPlaylists = useMemo(
		() =>
			[...playlists].sort(
				(left, right) =>
					left.sortOrder - right.sortOrder ||
					left.createdAt.localeCompare(right.createdAt),
			),
		[playlists],
	);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const button = buttonRef.current;
		if (button) {
			const rect = button.getBoundingClientRect();
			setPosition({
				top: Math.min(rect.bottom + 6, window.innerHeight - 360),
				right: Math.max(12, window.innerWidth - rect.right),
			});
		}

		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target as Node;
			if (
				!menuRef.current?.contains(target) &&
				!buttonRef.current?.contains(target)
			) {
				setIsOpen(false);
			}
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsOpen(false);
				buttonRef.current?.focus();
			}
		};
		const closeOnViewportChange = () => setIsOpen(false);
		document.addEventListener("pointerdown", closeOnOutsidePointer);
		document.addEventListener("keydown", closeOnEscape);
		window.addEventListener("resize", closeOnViewportChange);
		window.addEventListener("scroll", closeOnViewportChange, true);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutsidePointer);
			document.removeEventListener("keydown", closeOnEscape);
			window.removeEventListener("resize", closeOnViewportChange);
			window.removeEventListener("scroll", closeOnViewportChange, true);
		};
	}, [isOpen]);

	async function togglePlaylist(playlistId: string, alreadyIncluded: boolean) {
		setBusyPlaylistId(playlistId);
		try {
			if (alreadyIncluded) {
				await removeAudioFileFromPlaylist(playlistId, audioFileId);
			} else {
				await addAudioFileToPlaylist(playlistId, audioFileId);
			}
		} finally {
			setBusyPlaylistId(null);
		}
	}

	async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const name = newPlaylistName.trim();
		if (!name || isCreating) {
			return;
		}

		setIsCreating(true);
		try {
			await createPlaylist({ name, audioFileIds: [audioFileId] });
			setNewPlaylistName("");
			setIsOpen(false);
		} finally {
			setIsCreating(false);
		}
	}

	const menu = isOpen ? (
		<div
			ref={menuRef}
			role="menu"
			aria-label={`Add ${audioFileTitle} to a playlist`}
			className="fixed z-50 flex max-h-[22rem] w-72 flex-col overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] shadow-2xl"
			style={{ top: Math.max(12, position.top), right: position.right }}
		>
			<div className="border-b border-[var(--color-border-plain)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
				Add to playlist
			</div>
			<div className="min-h-0 overflow-y-auto py-1">
				{orderedPlaylists.length === 0 ? (
					<p className="px-3 py-3 text-sm text-[var(--color-text-muted)]">
						No playlists yet.
					</p>
				) : (
					orderedPlaylists.map((playlist) => {
						const included = playlist.audioFileIds.includes(audioFileId);
						return (
							<button
								key={playlist.id}
								type="button"
								role="menuitemcheckbox"
								aria-checked={included}
								disabled={busyPlaylistId !== null}
								onClick={() => void togglePlaylist(playlist.id, included)}
								className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-inset)] disabled:opacity-55"
							>
								<span className="flex h-4 w-4 items-center justify-center">
									{included ? <Check size={14} /> : null}
								</span>
								<span className="min-w-0 flex-1 truncate">{playlist.name}</span>
								<span className="text-xs tabular-nums text-[var(--color-text-muted)]">
									{playlist.audioFileIds.length}
								</span>
							</button>
						);
					})
				)}
			</div>
			<form
				onSubmit={(event) => void handleCreate(event)}
				className="flex gap-2 border-t border-[var(--color-border-plain)] p-2"
			>
				<input
					value={newPlaylistName}
					onChange={(event) => setNewPlaylistName(event.target.value)}
					placeholder="New playlist name"
					aria-label="New playlist name"
					maxLength={200}
					className="min-w-0 flex-1 border border-[var(--color-border-plain)] bg-[var(--color-surface-inset)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
				/>
				<button
					type="submit"
					disabled={!newPlaylistName.trim() || isCreating}
					className="icon-button icon-button--sm disabled:opacity-55"
					aria-label="Create playlist and add file"
					title="Create playlist and add file"
				>
					<Plus size={14} />
				</button>
			</form>
		</div>
	) : null;

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen((current) => !current)}
				className="icon-button icon-button--sm waveform-thumbnail__action"
				title="Add to playlist"
				aria-label={`Add ${audioFileTitle} to playlist`}
				aria-haspopup="menu"
				aria-expanded={isOpen}
			>
				<ListPlus size={12} />
			</button>
			{typeof document === "undefined"
				? null
				: createPortal(menu, document.body)}
		</>
	);
}
