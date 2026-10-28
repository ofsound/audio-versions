import { useEffect, useRef } from "react";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { getRemoteAudioUrl } from "#/lib/cloud/media";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useWaveformAudioGraph } from "./use-waveform-audio-graph";

export function LibraryPreviewAudio({
	audioFile,
	blob,
	onStop,
	onError,
}: {
	audioFile: AudioFileRecord;
	blob?: Blob;
	onStop: () => void;
	onError: (message: string) => void;
}) {
	const { registerAudioElement, reportPlaybackState, seekFile } =
		useAudioVersions();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	// Keep the source stable if the background cache finishes during a preview.
	const initialBlob = useRef(blob).current;
	const callbacks = useRef({ onStop, onError });
	callbacks.current = { onStop, onError };
	useWaveformAudioGraph({ audioRef, volumeDb: audioFile.volumeDb });

	useEffect(() => {
		const element = audioRef.current;
		if (!element) return;
		let cancelled = false;
		const objectUrl = initialBlob ? URL.createObjectURL(initialBlob) : null;
		registerAudioElement(audioFile.id, element);
		void (async () => {
			try {
				const source = objectUrl ?? (await getRemoteAudioUrl(audioFile.id));
				if (cancelled) return;
				element.src = source;
				await seekFile(audioFile.id, 0, true);
				if (!cancelled && element.paused) {
					callbacks.current.onError("Could not play this preview. Try again.");
				}
			} catch (error) {
				if (!cancelled)
					callbacks.current.onError(
						error instanceof Error
							? error.message
							: "Could not load this preview.",
					);
			}
		})();
		return () => {
			cancelled = true;
			element.pause();
			element.currentTime = 0;
			registerAudioElement(audioFile.id, null);
			reportPlaybackState(audioFile.id, { isPlaying: false, currentTimeMs: 0 });
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [
		audioFile.id,
		initialBlob,
		registerAudioElement,
		reportPlaybackState,
		seekFile,
	]);

	return (
		/* biome-ignore lint/a11y/useMediaCaption: hidden audio is controlled by the index row's Play/Stop button */
		<audio
			ref={audioRef}
			preload="none"
			className="hidden"
			onEnded={() => callbacks.current.onStop()}
			onError={() =>
				callbacks.current.onError("Could not load this preview. Try again.")
			}
			onPlay={() => reportPlaybackState(audioFile.id, { isPlaying: true })}
			onTimeUpdate={(event) =>
				reportPlaybackState(audioFile.id, {
					currentTimeMs: event.currentTarget.currentTime * 1000,
				})
			}
		/>
	);
}
