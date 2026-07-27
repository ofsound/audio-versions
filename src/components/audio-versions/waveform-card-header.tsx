import { Bookmark, Brackets, Pause, Play, RotateCcw, X } from "lucide-react";
import { formatDuration } from "#/lib/audio-versions/waveform";

interface WaveformCardHeaderProps {
	audioFileTitle: string;
	isPlaying: boolean;
	onAddMarkerAtPlayhead: () => void;
	onCancelPendingRange: () => void;
	onEndRangeAtPlayhead: () => void;
	onResetPlayhead: () => void;
	onStartRangeAtPlayhead: () => void;
	onTogglePlayback: () => void;
	pendingRangeStartMs: number | null;
}

export function WaveformCardHeader({
	audioFileTitle,
	isPlaying,
	onAddMarkerAtPlayhead,
	onCancelPendingRange,
	onEndRangeAtPlayhead,
	onResetPlayhead,
	onStartRangeAtPlayhead,
	onTogglePlayback,
	pendingRangeStartMs,
}: WaveformCardHeaderProps) {
	return (
		<div className="waveform-card__header mb-4 flex items-center">
			<div className="waveform-card__actions flex w-full flex-wrap items-center justify-between gap-2">
				<div className="waveform-card__playback flex min-w-0 flex-1 items-center gap-2">
					<button
						type="button"
						aria-label={`Reset playhead for ${audioFileTitle}`}
						onClick={onResetPlayhead}
						className="action-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
					>
						<RotateCcw size={16} />
					</button>
					<button
						type="button"
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={onTogglePlayback}
						className="action-primary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
					>
						{isPlaying ? (
							<Pause size={16} fill="currentColor" strokeWidth={0} />
						) : (
							<Play size={16} fill="currentColor" strokeWidth={0} />
						)}
					</button>
					<span
						data-testid="waveform-card-current-file-title"
						title={audioFileTitle}
						className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-muted)]"
					>
						{audioFileTitle}
					</span>
				</div>
				<div className="waveform-card__annotations ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
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
				</div>
			</div>
		</div>
	);
}
