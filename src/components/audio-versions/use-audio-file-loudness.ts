import { useEffect, useRef, useState } from "react";
import { measureLoudnessFromBlob } from "#/lib/audio-versions/loudness";
import type { LoudnessMetrics } from "#/lib/audio-versions/types";
import { isAudioDecodingSupported } from "#/lib/audio-versions/waveform";

interface UseAudioFileLoudnessOptions {
	audioFileId: string;
	blob?: Blob;
	loudness?: LoudnessMetrics;
	onMeasured: (loudness: LoudnessMetrics) => Promise<void>;
}

/**
 * Measures loudness for files imported before the analysis step existed. Only
 * locally cached audio is analyzed so opening a file never triggers a download.
 */
export function useAudioFileLoudness({
	audioFileId,
	blob,
	loudness,
	onMeasured,
}: UseAudioFileLoudnessOptions): boolean {
	const [measuring, setMeasuring] = useState(false);
	const measuredFileIdsRef = useRef(new Set<string>());
	const onMeasuredRef = useRef(onMeasured);
	onMeasuredRef.current = onMeasured;

	useEffect(() => {
		if (
			loudness ||
			!blob ||
			!isAudioDecodingSupported() ||
			measuredFileIdsRef.current.has(audioFileId)
		) {
			return;
		}

		measuredFileIdsRef.current.add(audioFileId);
		let cancelled = false;
		setMeasuring(true);

		void (async () => {
			try {
				const measured = await measureLoudnessFromBlob(blob);
				if (measured && !cancelled) {
					await onMeasuredRef.current(measured);
				}
			} catch {
				// Leave the readout empty when the file cannot be decoded.
			} finally {
				if (!cancelled) {
					setMeasuring(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [audioFileId, blob, loudness]);

	return measuring;
}
