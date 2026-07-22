import { X } from "lucide-react";
import { type MutableRefObject, useRef } from "react";
import { useModalFocusTrap } from "./use-modal-focus-trap";

interface SongModalProps {
	children: React.ReactNode;
	initialFocusRef?: MutableRefObject<HTMLElement | null>;
	maxWidthClassName?: string;
	onClose: () => void;
	title: string;
	titleId: string;
}

export function SongModal({
	children,
	initialFocusRef,
	maxWidthClassName = "max-w-[min(42rem,calc(100vw-2rem))]",
	onClose,
	title,
	titleId,
}: SongModalProps) {
	const panelRef = useRef<HTMLDivElement | null>(null);

	useModalFocusTrap({
		containerRef: panelRef,
		initialFocusRef,
	});

	return (
		<div
			className="song-modal"
			onKeyDownCapture={(event) => {
				if (event.key !== "Escape") {
					return;
				}

				event.preventDefault();
				onClose();
			}}
		>
			<button
				type="button"
				aria-label={`Dismiss ${title.toLowerCase()}`}
				onClick={onClose}
				className="song-modal__backdrop"
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className={`song-modal__panel w-full ${maxWidthClassName}`}
			>
				<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-plain)] px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<h2
							id={titleId}
							className="text-2xl font-semibold text-[var(--color-text)]"
						>
							{title}
						</h2>
					</div>
					<button
						type="button"
						aria-label={`Close ${title.toLowerCase()}`}
						onClick={onClose}
						className="icon-button shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				{children}
			</div>
		</div>
	);
}
