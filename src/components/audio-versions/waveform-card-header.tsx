import { Bookmark, Brackets, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "#/lib/audio-versions/waveform";

interface WaveformCardHeaderProps {
	audioFileTitle: string;
	isPlaying: boolean;
	onAddMarkerAtPlayhead: () => void;
	onCancelPendingRange: () => void;
	onEndRangeAtPlayhead: () => void;
	onResetPlayhead: () => void;
	onSelectFile: () => void;
	onStartRangeAtPlayhead: () => void;
	onTogglePlayback: () => void;
	onUpdateFile: (patch: { title?: string }) => void;
	pendingRangeStartMs: number | null;
}

export function WaveformCardHeader({
	audioFileTitle,
	isPlaying,
	onAddMarkerAtPlayhead,
	onCancelPendingRange,
	onEndRangeAtPlayhead,
	onResetPlayhead,
	onSelectFile,
	onStartRangeAtPlayhead,
	onTogglePlayback,
	onUpdateFile,
	pendingRangeStartMs,
}: WaveformCardHeaderProps) {
	const [editingTitle, setEditingTitle] = useState(false);
	const [draftTitle, setDraftTitle] = useState(audioFileTitle);
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const skipCommitRef = useRef(false);

	useEffect(() => {
		if (!editingTitle) {
			setDraftTitle(audioFileTitle);
		}
	}, [audioFileTitle, editingTitle]);

	useEffect(() => {
		if (editingTitle) {
			titleInputRef.current?.focus();
			titleInputRef.current?.select();
		}
	}, [editingTitle]);

	function commitTitle() {
		if (skipCommitRef.current) {
			skipCommitRef.current = false;
			return;
		}

		const nextTitle = draftTitle;
		setEditingTitle(false);
		if (nextTitle === audioFileTitle) {
			return;
		}

		onUpdateFile({ title: nextTitle });
	}

	function cancelTitle() {
		skipCommitRef.current = true;
		setDraftTitle(audioFileTitle);
		setEditingTitle(false);
	}

	return (
		<div className="waveform-card__header mb-4 flex flex-wrap items-center justify-between gap-3">
			<div className="waveform-card__identity flex w-full min-w-0 items-center gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex min-w-0 items-center gap-2">
						{editingTitle ? (
							<input
								ref={titleInputRef}
								value={draftTitle}
								onChange={(event) => setDraftTitle(event.target.value)}
								onBlur={() => commitTitle()}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										event.currentTarget.blur();
										return;
									}

									if (event.key === "Escape") {
										event.preventDefault();
										cancelTitle();
									}
								}}
								onClick={(event) => event.stopPropagation()}
								className="field-input font-title waveform-card__title min-w-0 flex-1 py-1 text-3xl font-semibold"
								aria-label="File title"
							/>
						) : (
							<button
								type="button"
								onClick={onSelectFile}
								onDoubleClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setEditingTitle(true);
								}}
								className="font-title waveform-card__title min-w-0 flex-1 truncate text-left text-3xl font-semibold text-[var(--color-text)]"
								title="Double-click to rename"
							>
								{audioFileTitle}
							</button>
						)}
					</div>
				</div>
			</div>

			<div className="waveform-card__actions flex w-full flex-wrap items-center justify-between gap-2">
				<div className="waveform-card__playback flex items-center gap-2">
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
						{isPlaying ? (
							<Pause size={16} fill="currentColor" strokeWidth={0} />
						) : (
							<Play size={16} fill="currentColor" strokeWidth={0} />
						)}
					</button>
				</div>
				<div className="waveform-card__annotations ml-auto flex flex-wrap items-center justify-end gap-2">
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
