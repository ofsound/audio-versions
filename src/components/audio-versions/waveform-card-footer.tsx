import { Minus, Plus } from "lucide-react";
import { describeStreamingNormalization } from "#/lib/audio-versions/loudness";
import type { LoudnessMetrics } from "#/lib/audio-versions/types";
import {
	formatDuration,
	MAX_VOLUME_DB,
	MIN_VOLUME_DB,
} from "#/lib/audio-versions/waveform";

interface WaveformCardFooterProps {
	audioFileTitle: string;
	currentTimeMs: number;
	durationMs: number;
	loudness?: LoudnessMetrics;
	measuringLoudness: boolean;
	onStepVolume: (deltaDb: number) => Promise<void>;
	volumeDb: number;
}

export function WaveformCardFooter({
	audioFileTitle,
	currentTimeMs,
	durationMs,
	loudness,
	measuringLoudness,
	onStepVolume,
	volumeDb,
}: WaveformCardFooterProps) {
	return (
		<div className="waveform-card__footer mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-[var(--color-text-muted)]">
			<span className="text-sm tabular-nums text-[var(--color-text)]">
				{formatDuration(currentTimeMs)} / {formatDuration(durationMs)}
			</span>
			{loudness ? <LoudnessReadout loudness={loudness} /> : null}
			{!loudness && measuringLoudness ? <span>Measuring loudness…</span> : null}
			<div className="inline-flex items-center gap-1.5">
				<button
					type="button"
					onClick={() => void onStepVolume(-1)}
					disabled={volumeDb <= MIN_VOLUME_DB}
					aria-label={`Decrease volume for ${audioFileTitle}`}
					className="icon-button icon-button--sm disabled:cursor-not-allowed disabled:opacity-45"
				>
					<Minus size={12} />
				</button>
				<output
					aria-live="polite"
					className="min-w-[3rem] text-center text-xs font-semibold tabular-nums text-[var(--color-text)]"
				>
					{formatVolumeDb(volumeDb)}
				</output>
				<button
					type="button"
					onClick={() => void onStepVolume(1)}
					disabled={volumeDb >= MAX_VOLUME_DB}
					aria-label={`Increase volume for ${audioFileTitle}`}
					className="icon-button icon-button--sm disabled:cursor-not-allowed disabled:opacity-45"
				>
					<Plus size={12} />
				</button>
			</div>
		</div>
	);
}

function LoudnessReadout({ loudness }: { loudness: LoudnessMetrics }) {
	return (
		<div
			className="inline-flex items-center gap-1.5 tabular-nums"
			data-testid="waveform-loudness"
		>
			<span
				title={`Integrated loudness\n${describeStreamingNormalization(loudness.integratedLufs)}`}
			>
				{loudness.integratedLufs.toFixed(1)} LUFS
			</span>
			<span aria-hidden="true" className="opacity-40">
				·
			</span>
			<span
				title={`Loudness range\nShort-term max ${loudness.shortTermMaxLufs.toFixed(1)} LUFS`}
			>
				{loudness.loudnessRangeLu.toFixed(1)} LU
			</span>
			<span aria-hidden="true" className="opacity-40">
				·
			</span>
			<span
				title={`True peak\nSample peak ${loudness.samplePeakDb.toFixed(1)} dBFS`}
			>
				{loudness.truePeakDb.toFixed(1)} dBTP
			</span>
		</div>
	);
}

function formatVolumeDb(volumeDb: number) {
	if (volumeDb > 0) {
		return `+${volumeDb} dB`;
	}

	return `${volumeDb} dB`;
}
