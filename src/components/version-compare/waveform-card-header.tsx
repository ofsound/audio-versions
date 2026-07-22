import {
	Bookmark,
	Brackets,
	GripVertical,
	Pause,
	Play,
	RotateCcw,
	Settings2,
	X,
} from "lucide-react";
import { formatDuration } from "#/lib/version-compare/waveform";

interface WaveformCardHeaderProps {
	audioFileTitle: string;
	isPlaying: boolean;
	onAddMarkerAtPlayhead: () => void;
	onArmDrag: () => void;
	onCancelPendingRange: () => void;
	onEndRangeAtPlayhead: () => void;
	onOpenFileDetails: () => void;
	onReleaseDrag: () => void;
	onResetPlayhead: () => void;
	onSelectFile: () => void;
	onStartRangeAtPlayhead: () => void;
	onTogglePlayback: () => void;
	pendingRangeStartMs: number | null;
	sessionDateLabel: string | null;
}

export function WaveformCardHeader({
	audioFileTitle,
	isPlaying,
	onAddMarkerAtPlayhead,
	onArmDrag,
	onCancelPendingRange,
	onEndRangeAtPlayhead,
	onOpenFileDetails,
	onReleaseDrag,
	onResetPlayhead,
	onSelectFile,
	onStartRangeAtPlayhead,
	onTogglePlayback,
	pendingRangeStartMs,
	sessionDateLabel,
}: WaveformCardHeaderProps) {
	return (
		<div className="waveform-card__header mb-4 flex flex-wrap items-center justify-between gap-3">
			<div className="waveform-card__identity flex min-w-0 items-center gap-3">
				<button
					type="button"
					aria-label={`Reorder ${audioFileTitle}`}
					onPointerDown={onArmDrag}
					onPointerUp={onReleaseDrag}
					onPointerCancel={onReleaseDrag}
					onBlur={onReleaseDrag}
					className="waveform-card__reorder icon-button h-10 w-10 shrink-0"
					title="Drag to reorder"
				>
					<GripVertical size={16} />
				</button>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex min-w-0 items-baseline gap-2">
						<button
							type="button"
							onClick={onSelectFile}
							className="waveform-card__title min-w-0 flex-1 truncate text-left text-lg font-semibold text-[var(--color-text)]"
						>
							{audioFileTitle}
						</button>
						<button
							type="button"
							onClick={onOpenFileDetails}
							className="icon-button icon-button--sm -ml-0.5 shrink-0"
							title="Edit file details"
							aria-label={`Edit details for ${audioFileTitle}`}
						>
							<Settings2 size={12} />
						</button>
					</div>
					{sessionDateLabel ? (
						<span className="waveform-card__date whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]">
							{sessionDateLabel}
						</span>
					) : null}
				</div>
			</div>

			<div className="waveform-card__actions flex flex-wrap items-center gap-2">
				<button
					type="button"
					aria-label={`Add marker at playhead for ${audioFileTitle}`}
					onClick={onAddMarkerAtPlayhead}
					className="action-secondary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
				>
					<Bookmark size={14} />
					<span>Add marker</span>
				</button>
				{pendingRangeStartMs === null ? (
					<button
						type="button"
						aria-label={`Start range at playhead for ${audioFileTitle}`}
						onClick={onStartRangeAtPlayhead}
						className="action-secondary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
					>
						<Brackets size={14} />
						<span>Start range</span>
					</button>
				) : (
					<>
						<button
							type="button"
							aria-label={`End range at playhead for ${audioFileTitle}`}
							onClick={onEndRangeAtPlayhead}
							className="action-primary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
						>
							<Brackets size={14} />
							<span>End range @ {formatDuration(pendingRangeStartMs)}</span>
						</button>
						<button
							type="button"
							aria-label={`Cancel pending range for ${audioFileTitle}`}
							onClick={onCancelPendingRange}
							className="action-secondary inline-flex h-9 w-9 items-center justify-center p-0"
						>
							<X size={16} />
						</button>
					</>
				)}
				<button
					type="button"
					aria-label={`Reset playhead for ${audioFileTitle}`}
					onClick={onResetPlayhead}
					className="action-secondary inline-flex h-9 w-9 items-center justify-center p-0"
				>
					<RotateCcw size={16} />
				</button>
				<button
					type="button"
					aria-label={isPlaying ? "Pause" : "Play"}
					onClick={onTogglePlayback}
					className="action-primary inline-flex h-9 w-9 items-center justify-center p-0"
				>
					{isPlaying ? <Pause size={16} /> : <Play size={16} />}
				</button>
			</div>
		</div>
	);
}
