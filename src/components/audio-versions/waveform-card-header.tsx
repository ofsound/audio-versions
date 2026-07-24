import {
	Bookmark,
	Brackets,
	Pause,
	Play,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "#/lib/audio-versions/waveform";

interface WaveformCardHeaderProps {
	audioFileTitle: string;
	deletingFile: boolean;
	isPlaying: boolean;
	onAddMarkerAtPlayhead: () => void;
	onCancelPendingRange: () => void;
	onDeleteFile: () => void;
	onEndRangeAtPlayhead: () => void;
	onResetPlayhead: () => void;
	onSelectFile: () => void;
	onStartRangeAtPlayhead: () => void;
	onTogglePlayback: () => void;
	onUpdateFile: (patch: { title?: string; sessionDate?: string }) => void;
	pendingRangeStartMs: number | null;
	sessionDateIso: string;
	sessionDateLabel: string;
}

export function WaveformCardHeader({
	audioFileTitle,
	deletingFile,
	isPlaying,
	onAddMarkerAtPlayhead,
	onCancelPendingRange,
	onDeleteFile,
	onEndRangeAtPlayhead,
	onResetPlayhead,
	onSelectFile,
	onStartRangeAtPlayhead,
	onTogglePlayback,
	onUpdateFile,
	pendingRangeStartMs,
	sessionDateIso,
	sessionDateLabel,
}: WaveformCardHeaderProps) {
	const [editingField, setEditingField] = useState<"title" | "date" | null>(
		null,
	);
	const [draftTitle, setDraftTitle] = useState(audioFileTitle);
	const [draftDate, setDraftDate] = useState(sessionDateIso);
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const dateInputRef = useRef<HTMLInputElement | null>(null);
	const skipCommitRef = useRef(false);

	useEffect(() => {
		if (editingField !== "title") {
			setDraftTitle(audioFileTitle);
		}
	}, [audioFileTitle, editingField]);

	useEffect(() => {
		if (editingField !== "date") {
			setDraftDate(sessionDateIso);
		}
	}, [editingField, sessionDateIso]);

	useEffect(() => {
		if (editingField === "title") {
			titleInputRef.current?.focus();
			titleInputRef.current?.select();
			return;
		}

		if (editingField === "date") {
			dateInputRef.current?.focus();
		}
	}, [editingField]);

	function commitTitle() {
		if (skipCommitRef.current) {
			skipCommitRef.current = false;
			return;
		}

		const nextTitle = draftTitle;
		setEditingField(null);
		if (nextTitle === audioFileTitle) {
			return;
		}

		onUpdateFile({ title: nextTitle });
	}

	function cancelTitle() {
		skipCommitRef.current = true;
		setDraftTitle(audioFileTitle);
		setEditingField(null);
	}

	function commitDate() {
		if (skipCommitRef.current) {
			skipCommitRef.current = false;
			return;
		}

		const nextDate = draftDate;
		setEditingField(null);
		if (nextDate === sessionDateIso) {
			return;
		}

		onUpdateFile({ sessionDate: nextDate });
	}

	function cancelDate() {
		skipCommitRef.current = true;
		setDraftDate(sessionDateIso);
		setEditingField(null);
	}

	return (
		<div className="waveform-card__header mb-4 flex flex-wrap items-center justify-between gap-3">
			<div className="waveform-card__identity flex w-full min-w-0 items-center gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex min-w-0 items-center gap-2">
						{editingField === "title" ? (
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
								className="field-input font-title waveform-card__title min-w-0 flex-1 py-1 text-2xl font-semibold"
								aria-label="File title"
							/>
						) : (
							<button
								type="button"
								onClick={onSelectFile}
								onDoubleClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setEditingField("title");
								}}
								className="font-title waveform-card__title min-w-0 flex-1 truncate text-left text-2xl font-semibold text-[var(--color-text)]"
								title="Double-click to rename"
							>
								{audioFileTitle}
							</button>
						)}
						<button
							type="button"
							onClick={onDeleteFile}
							disabled={deletingFile}
							className="icon-button icon-button--sm shrink-0 text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
							title="Delete file"
							aria-label={`Delete ${audioFileTitle}`}
						>
							<Trash2 size={12} />
						</button>
					</div>
					{editingField === "date" ? (
						<input
							ref={dateInputRef}
							type="date"
							value={draftDate}
							onChange={(event) => setDraftDate(event.target.value)}
							onBlur={() => commitDate()}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									event.currentTarget.blur();
									return;
								}

								if (event.key === "Escape") {
									event.preventDefault();
									cancelDate();
								}
							}}
							onClick={(event) => event.stopPropagation()}
							className="field-input field-input--compact waveform-card__date mt-0.5 w-auto max-w-[11rem] text-sm"
							aria-label="File date"
						/>
					) : (
						<button
							type="button"
							onClick={onSelectFile}
							onDoubleClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								setEditingField("date");
							}}
							className="waveform-card__date mt-0.5 w-fit whitespace-nowrap text-left text-sm tabular-nums text-[var(--color-text-muted)]"
							title="Double-click to edit date"
						>
							{sessionDateLabel}
						</button>
					)}
				</div>
			</div>

			<div className="waveform-card__actions ml-auto flex flex-wrap items-center gap-2">
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
