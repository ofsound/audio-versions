import type { RefObject } from "react";

interface WaveformCardAudioProps {
	audioFileDurationMs: number;
	audioRef: RefObject<HTMLAudioElement | null>;
	currentTimeMs: number;
	objectUrl: string | null;
	onRegisterAudioElement: (element: HTMLAudioElement | null) => void;
	onReportPlayback: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
}

export function WaveformCardAudio({
	audioFileDurationMs,
	audioRef,
	currentTimeMs,
	objectUrl,
	onRegisterAudioElement,
	onReportPlayback,
}: WaveformCardAudioProps) {
	return (
		/* biome-ignore lint/a11y/useMediaCaption: hidden transport audio is controlled programmatically instead of being exposed as standalone media */
		<audio
			crossOrigin="anonymous"
			ref={(element) => {
				audioRef.current = element;
				onRegisterAudioElement(element);
			}}
			src={objectUrl ?? undefined}
			preload="metadata"
			className="hidden"
			onPlay={(event) =>
				onReportPlayback({
					isPlaying: true,
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onPause={(event) =>
				onReportPlayback({
					isPlaying: false,
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onTimeUpdate={(event) =>
				onReportPlayback({
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
			onLoadedMetadata={() => {
				if (
					audioRef.current &&
					Math.abs(audioRef.current.currentTime - currentTimeMs / 1000) > 0.3
				) {
					audioRef.current.currentTime = currentTimeMs / 1000;
				}
			}}
			onEnded={() =>
				onReportPlayback({
					isPlaying: false,
					currentTimeMs: audioFileDurationMs,
				})
			}
		/>
	);
}
