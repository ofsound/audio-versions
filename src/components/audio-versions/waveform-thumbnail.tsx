import { useMemo, useRef } from "react";
import { resolveAudioFileSessionDateLabel } from "#/lib/audio-versions/dates";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { normalizeWaveformData } from "#/lib/audio-versions/waveform";
import { useWaveformCanvas } from "./use-waveform-canvas";

interface WaveformThumbnailProps {
	audioFile: AudioFileRecord;
	currentTimeMs: number;
	isSelected: boolean;
	onSelectFile: (fileId: string) => void;
}

export function WaveformThumbnail({
	audioFile,
	currentTimeMs,
	isSelected,
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

	return (
		<button
			type="button"
			aria-label={`Select ${audioFile.title}`}
			aria-pressed={isSelected}
			onClick={() => onSelectFile(audioFile.id)}
			className={`group relative w-full min-w-0 overflow-hidden border text-left transition-[border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
				isSelected
					? "border-[var(--color-waveform-selected)] shadow-[inset_0_0_0_1px_var(--color-waveform-selected)]"
					: "border-[var(--color-border-plain)] hover:border-[var(--color-border-strong)]"
			}`}
		>
			<div
				ref={surfaceRef}
				className="waveform-thumbnail__surface waveform-surface relative aspect-[5/1] min-h-16 w-full sm:min-h-20"
			>
				<canvas ref={canvasRef} className="block w-full" />
				<div className="waveform-thumbnail__overlay pointer-events-none absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_78%,transparent),color-mix(in_srgb,var(--color-surface)_12%,transparent)_46%,color-mix(in_srgb,var(--color-surface)_78%,transparent))] p-2">
					<span className="font-title waveform-thumbnail__title self-start truncate bg-black px-1.5 py-0.5 text-[11px] font-semibold text-white sm:text-xs">
						{audioFile.title}
					</span>
					{sessionDateLabel ? (
						<span className="waveform-thumbnail__date self-end bg-black px-1.5 py-0.5 text-[9px] tabular-nums text-white sm:text-[10px]">
							{sessionDateLabel}
						</span>
					) : null}
				</div>
			</div>
		</button>
	);
}
