import { Download, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { resolveAudioFileSessionDateLabel } from "#/lib/audio-versions/dates";
import { downloadAudioFile } from "#/lib/audio-versions/download-audio-file";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import {
	formatDuration,
	normalizeWaveformData,
} from "#/lib/audio-versions/waveform";
import { useWaveformCanvas } from "./use-waveform-canvas";

interface WaveformThumbnailProps {
	audioFile: AudioFileRecord;
	blob?: Blob;
	currentTimeMs: number;
	deletingFile: boolean;
	isSelected: boolean;
	onDeleteFile: (fileId: string) => void;
	onSelectFile: (fileId: string) => void;
}

export function WaveformThumbnail({
	audioFile,
	blob,
	currentTimeMs,
	deletingFile,
	isSelected,
	onDeleteFile,
	onSelectFile,
}: WaveformThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const waveform = useMemo(
		() => normalizeWaveformData(audioFile.waveform, audioFile.durationMs),
		[audioFile.durationMs, audioFile.waveform],
	);

	useWaveformCanvas({
		canvasRef,
		currentTimeMs,
		isSelected,
		surfaceRef,
		waveform,
	});

	const sessionDateLabel = resolveAudioFileSessionDateLabel(audioFile);
	const canDownloadFile = Boolean(blob || audioFile.remoteMedia);
	const [downloadingFile, setDownloadingFile] = useState(false);

	async function handleDownloadFile() {
		if (!canDownloadFile || downloadingFile) {
			return;
		}

		setDownloadingFile(true);
		try {
			await downloadAudioFile({ audioFile, blob });
		} catch (error) {
			window.alert(
				error instanceof Error
					? error.message
					: "Audio Versions could not download that audio file.",
			);
		} finally {
			setDownloadingFile(false);
		}
	}

	return (
		<div
			className={`waveform-thumbnail group relative w-full min-w-0 overflow-hidden border text-left transition-[border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
				isSelected
					? "border-[var(--color-waveform-selected)] shadow-[inset_0_0_0_1px_var(--color-waveform-selected)]"
					: "border-[var(--color-border-plain)] hover:border-[var(--color-border-strong)]"
			}`}
		>
			<button
				type="button"
				aria-label={`Select ${audioFile.title}`}
				aria-pressed={isSelected}
				onClick={() => onSelectFile(audioFile.id)}
				className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
			/>
			<div
				ref={surfaceRef}
				className="waveform-thumbnail__surface waveform-surface relative aspect-[5/1] max-h-[var(--song-workspace-waveform-height)] min-h-16 w-full sm:min-h-20"
			>
				<canvas ref={canvasRef} className="block h-full w-full min-w-0" />
				<div className="waveform-thumbnail__overlay pointer-events-none absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_78%,transparent),color-mix(in_srgb,var(--color-surface)_12%,transparent)_46%,color-mix(in_srgb,var(--color-surface)_78%,transparent))] p-2">
					<span className="font-title waveform-thumbnail__title max-w-[calc(100%-4.5rem)] self-start truncate bg-black px-1.5 py-0.5 text-xs font-semibold text-white sm:text-sm">
						{audioFile.title}
					</span>
					<div className="flex w-full items-end justify-between gap-2">
						{sessionDateLabel ? (
							<span className="waveform-thumbnail__date bg-black px-1.5 py-0.5 text-[10px] tabular-nums text-white sm:text-xs">
								{sessionDateLabel}
							</span>
						) : null}
						<span className="waveform-thumbnail__date ml-auto bg-black px-1.5 py-0.5 text-[10px] tabular-nums text-white sm:text-xs">
							{formatDuration(currentTimeMs)}
						</span>
					</div>
				</div>
			</div>
			<div className="absolute top-2 right-2 z-20 flex items-center gap-1">
				<button
					type="button"
					onClick={() => void handleDownloadFile()}
					disabled={!canDownloadFile || downloadingFile}
					className="icon-button icon-button--sm bg-black text-white disabled:cursor-not-allowed disabled:opacity-55"
					title="Download file"
					aria-label={`Download ${audioFile.title}`}
				>
					<Download size={12} />
				</button>
				<button
					type="button"
					onClick={() => onDeleteFile(audioFile.id)}
					disabled={deletingFile}
					className="icon-button icon-button--sm bg-black text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
					title="Delete file"
					aria-label={`Delete ${audioFile.title}`}
				>
					<Trash2 size={12} />
				</button>
			</div>
		</div>
	);
}
