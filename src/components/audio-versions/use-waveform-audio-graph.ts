import { type MutableRefObject, useEffect, useSyncExternalStore } from "react";
import {
	connectAudioElement,
	getAudioEngineGeneration,
	releaseAudioElement,
	setAudioElementGain,
	subscribeToAudioEngineGeneration,
} from "#/lib/audio-versions/audio-engine";
import { volumeDbToGain } from "#/lib/audio-versions/waveform";

interface UseWaveformAudioGraphOptions {
	audioRef: MutableRefObject<HTMLAudioElement | null>;
	volumeDb: number;
}

export function useWaveformAudioGraph({
	audioRef,
	volumeDb,
}: UseWaveformAudioGraphOptions) {
	const audioEngineGeneration = useSyncExternalStore(
		subscribeToAudioEngineGeneration,
		getAudioEngineGeneration,
		getAudioEngineGeneration,
	);

	useEffect(() => {
		if (getAudioEngineGeneration() !== audioEngineGeneration) {
			return;
		}

		const element = audioRef.current;
		if (!element) {
			return;
		}

		connectAudioElement(element);
		return () => {
			releaseAudioElement(element);
		};
	}, [audioEngineGeneration, audioRef]);

	useEffect(() => {
		if (
			getAudioEngineGeneration() === audioEngineGeneration &&
			audioRef.current
		) {
			setAudioElementGain(audioRef.current, volumeDbToGain(volumeDb));
		}
	}, [audioEngineGeneration, audioRef, volumeDb]);

	return audioEngineGeneration;
}
