import {
	type MutableRefObject,
	useEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import {
	getAudioEngineGeneration,
	hasAudioElementGraph,
	releaseAudioElement,
	resumeSharedAudioContext,
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
	const volumeRef = useRef(volumeDb);
	volumeRef.current = volumeDb;
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

		// Native audio must only initialize on playback, never while opening a song.
		const prepare = () => {
			setAudioElementGain(element, volumeDbToGain(volumeRef.current));
			void resumeSharedAudioContext();
		};
		element.addEventListener("play", prepare);
		if (!element.paused) prepare();
		return () => {
			element.removeEventListener("play", prepare);
			releaseAudioElement(element);
		};
	}, [audioEngineGeneration, audioRef]);

	useEffect(() => {
		if (
			getAudioEngineGeneration() === audioEngineGeneration &&
			audioRef.current &&
			hasAudioElementGraph(audioRef.current)
		) {
			setAudioElementGain(audioRef.current, volumeDbToGain(volumeDb));
		}
	}, [audioEngineGeneration, audioRef, volumeDb]);

	return audioEngineGeneration;
}
