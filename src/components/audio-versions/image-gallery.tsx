import {
	ChevronLeft,
	ChevronRight,
	ImagePlus,
	Images,
	Minus,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GALLERY_IMAGE_ACCEPT } from "#/lib/audio-versions/gallery-images";
import type { GalleryImage, GalleryScope } from "#/lib/audio-versions/types";
import { SongModal } from "./song-modal";
import { useGalleryImage } from "./use-gallery-image";

export interface GalleryGroup {
	label: string;
	scope: GalleryScope;
	images: GalleryImage[];
}

function GalleryThumbnail({
	image,
	scope,
	selected = false,
	onClick,
}: {
	image: GalleryImage;
	scope: GalleryScope;
	selected?: boolean;
	onClick: () => void;
}) {
	const source = useGalleryImage(image, scope, true);
	return (
		<button
			type="button"
			onClick={onClick}
			title={image.name}
			aria-label={`View ${image.name}`}
			aria-pressed={selected}
			className={`relative h-16 w-24 shrink-0 overflow-hidden border bg-[var(--color-surface)] ${selected ? "border-[var(--color-accent-strong)] ring-2 ring-[var(--color-accent)]" : "border-[var(--color-border-plain)] hover:border-[var(--color-accent)]"}`}
		>
			{source.url ? (
				<img
					src={source.url}
					alt=""
					className="h-full w-full object-contain"
					onError={source.fail}
				/>
			) : (
				<span className="flex h-full items-center justify-center px-1 text-xs text-[var(--color-text-muted)]">
					{source.error ? "Preview unavailable" : "Loading…"}
				</span>
			)}
		</button>
	);
}

export function GalleryStrip({
	group,
	onOpen,
	onAdd,
	busy,
}: {
	group: GalleryGroup;
	onOpen: (imageId: string) => void;
	onAdd: (files: File[]) => void;
	busy: boolean;
}) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<section
			aria-label={group.label}
			className="mx-6 mb-4 shrink-0 border border-[var(--color-border-plain)] px-3 py-3 xl:mb-0"
		>
			<div className="flex items-center justify-between gap-2">
				<span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)]">
					<Images size={16} />
					{group.scope.audioFileId ? "File gallery" : "Song gallery"}
					{group.images.length ? ` (${group.images.length})` : ""}
				</span>
				<button
					type="button"
					aria-label={busy ? "Adding images" : "Add images"}
					title="Add images"
					className="action-secondary inline-flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs"
					onClick={() => input.current?.click()}
					disabled={busy}
				>
					<ImagePlus size={14} />
					{busy ? "Adding…" : "Add"}
				</button>
				<input
					ref={input}
					type="file"
					multiple
					accept={GALLERY_IMAGE_ACCEPT}
					aria-label={`Add ${group.label.toLowerCase()}`}
					className="sr-only"
					tabIndex={-1}
					onChange={(event) => {
						onAdd(Array.from(event.target.files ?? []));
						event.target.value = "";
					}}
				/>
			</div>
			{group.images.length ? (
				<section
					className="mt-2 flex gap-2 overflow-x-auto py-1"
					aria-label={`${group.label} thumbnails`}
				>
					{group.images.map((image) => (
						<GalleryThumbnail
							key={image.id}
							image={image}
							scope={group.scope}
							onClick={() => onOpen(image.id)}
						/>
					))}
				</section>
			) : (
				<p className="mt-1 text-xs text-[var(--color-text-muted)]">
					Drop screenshots here, or choose images.
				</p>
			)}
		</section>
	);
}

function GalleryOriginal({
	image,
	scope,
	zoomed,
}: {
	image: GalleryImage;
	scope: GalleryScope;
	zoomed: boolean;
}) {
	const source = useGalleryImage(image, scope, false);
	return (
		<div
			className={`h-full min-h-0 w-full overflow-auto bg-[var(--color-app)] p-3 ${zoomed ? "" : "flex items-center justify-center"}`}
		>
			{source.url ? (
				<img
					src={source.url}
					alt={image.name}
					onError={source.fail}
					className={
						zoomed
							? "mx-auto block max-w-none"
							: "max-h-full max-w-full object-contain"
					}
				/>
			) : source.error ? (
				<div
					role="alert"
					className="grid max-w-md justify-items-center gap-3 p-4 text-center text-sm"
				>
					<p>{source.error}</p>
					<button
						type="button"
						className="action-secondary px-3 py-2"
						onClick={source.retry}
					>
						Retry image
					</button>
				</div>
			) : (
				<output className="text-sm text-[var(--color-text-muted)]">
					Loading image…
				</output>
			)}
		</div>
	);
}

export function GalleryViewer({
	groups,
	imageId,
	onSelect,
	onClose,
	onRemove,
	busy,
}: {
	groups: GalleryGroup[];
	imageId: string;
	onSelect: (id: string) => void;
	onClose: () => void;
	onRemove: (scope: GalleryScope, imageId: string) => Promise<void>;
	busy: boolean;
}) {
	const entries = groups.flatMap((group) =>
		group.images.map((image) => ({ image, group })),
	);
	const index = entries.findIndex((entry) => entry.image.id === imageId);
	const current = entries[index] ?? entries[0];
	const [zoomed, setZoomed] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const step = (delta: number) => {
		const next =
			entries[(Math.max(0, index) + delta + entries.length) % entries.length];
		if (next) {
			setZoomed(false);
			onSelect(next.image.id);
		}
	};
	// A selected file can be removed or changed by another client while this is open.
	useEffect(() => {
		if (!current) onClose();
	}, [current, onClose]);
	if (!current) return null;
	return (
		<SongModal
			title="Image Gallery"
			titleId="image-gallery-title"
			contained
			onClose={onClose}
			onKeyDown={(event) => {
				if (
					event.target instanceof HTMLInputElement ||
					event.target instanceof HTMLTextAreaElement
				)
					return;
				if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					event.preventDefault();
					event.stopPropagation();
					step(event.key === "ArrowLeft" ? -1 : 1);
				}
			}}
			wide
		>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border-plain)] px-4 py-2">
					<div className="min-w-0 flex-1">
						<p
							className="truncate text-sm font-semibold"
							title={current.image.name}
						>
							{current.image.name}
						</p>
					</div>
					<button
						type="button"
						aria-label="Previous image"
						className="icon-button"
						disabled={entries.length < 2}
						onClick={() => step(-1)}
					>
						<ChevronLeft size={18} />
					</button>
					<button
						type="button"
						aria-label="Next image"
						className="icon-button"
						disabled={entries.length < 2}
						onClick={() => step(1)}
					>
						<ChevronRight size={18} />
					</button>
					<button
						type="button"
						aria-label={zoomed ? "Fit image" : "Show original size"}
						aria-pressed={zoomed}
						className="action-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
						onClick={() => setZoomed((value) => !value)}
					>
						{zoomed ? <Minus size={14} /> : <Plus size={14} />}
						{zoomed ? "Fit" : "100%"}
					</button>
					<button
						type="button"
						aria-label="Remove image"
						className="icon-button"
						disabled={busy || removing}
						onClick={async () => {
							if (
								!window.confirm(
									`Remove “${current.image.name}” from ${current.group.label.toLowerCase()}? This cannot be undone.`,
								)
							)
								return;
							setRemoving(true);
							setRemoveError(null);
							try {
								const next = entries.find(
									(entry) => entry.image.id !== current.image.id,
								);
								await onRemove(current.group.scope, current.image.id);
								if (next) onSelect(next.image.id);
								else onClose();
							} catch (error) {
								setRemoveError(
									error instanceof Error
										? error.message
										: "Image could not be removed.",
								);
							} finally {
								setRemoving(false);
							}
						}}
					>
						<Trash2 size={16} />
					</button>
				</div>
				{removeError && (
					<p role="alert" className="px-4 py-2 text-sm">
						{removeError}
					</p>
				)}
				<div className="min-h-0 flex-1">
					<GalleryOriginal
						key={current.image.id}
						image={current.image}
						scope={current.group.scope}
						zoomed={zoomed}
					/>
				</div>
				<div className="grid max-h-44 shrink-0 gap-2 overflow-y-auto border-t border-[var(--color-border-plain)] px-4 py-3 sm:grid-cols-2">
					{groups.map((group) => (
						<section
							key={group.scope.audioFileId ?? "song"}
							aria-label={`${group.label} overview`}
							className="min-w-0"
						>
							<p className="mb-2 truncate text-sm font-medium">{group.label}</p>
							<div className="flex gap-2 overflow-x-auto p-1">
								{group.images.length ? (
									group.images.map((image) => (
										<GalleryThumbnail
											key={image.id}
											image={image}
											scope={group.scope}
											selected={current.image.id === image.id}
											onClick={() => {
												setZoomed(false);
												onSelect(image.id);
											}}
										/>
									))
								) : (
									<span className="text-xs text-[var(--color-text-muted)]">
										No images yet
									</span>
								)}
							</div>
						</section>
					))}
				</div>
			</div>
		</SongModal>
	);
}
