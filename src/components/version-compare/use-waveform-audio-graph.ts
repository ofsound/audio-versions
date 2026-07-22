import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { volumeDbToGain } from "#/lib/version-compare/waveform";

interface AudioGraph {
	context: AudioContext;
	sourceNode: MediaElementAudioSourceNode;
	gainNode: GainNode;
}

const audioGraphByElement = new WeakMap<HTMLAudioElement, AudioGraph>();

interface UseWaveformAudioGraphOptions {
	audioRef: MutableRefObject<HTMLAudioElement | null>;
	isPlaying: boolean;
	volumeDb: number;
}

export function useWaveformAudioGraph({
	audioRef,
	isPlaying,
	volumeDb,
}: UseWaveformAudioGraphOptions) {
	const audioContextRef = useRef<AudioContext | null>(null);
	const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);

	const ensureAudioGraph = useCallback(() => {
		if (typeof window === "undefined") {
			return null;
		}

		if (
			audioContextRef.current &&
			sourceNodeRef.current &&
			gainNodeRef.current
		) {
			return audioContextRef.current;
		}

		const element = audioRef.current;
		if (!element) {
			return null;
		}

		const existingGraph = audioGraphByElement.get(element);
		if (existingGraph) {
			audioContextRef.current = existingGraph.context;
			sourceNodeRef.current = existingGraph.sourceNode;
			gainNodeRef.current = existingGraph.gainNode;
			element.volume = 1;
			return existingGraph.context;
		}

		const AudioContextCtor =
			window.AudioContext ||
			(window as Window & { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext;

		if (!AudioContextCtor) {
			return null;
		}

		const context = new AudioContextCtor();
		const source = context.createMediaElementSource(element);
		const gainNode = context.createGain();

		source.connect(gainNode);
		gainNode.connect(context.destination);

		audioGraphByElement.set(element, {
			context,
			sourceNode: source,
			gainNode,
		});
		audioContextRef.current = context;
		sourceNodeRef.current = source;
		gainNodeRef.current = gainNode;
		element.volume = 1;

		return context;
	}, [audioRef]);

	useEffect(() => {
		const context = ensureAudioGraph();
		const gainNode = gainNodeRef.current;
		const nextGain = volumeDbToGain(volumeDb);

		if (context && gainNode) {
			gainNode.gain.value = nextGain;
			return;
		}

		if (audioRef.current) {
			audioRef.current.volume = Math.min(1, nextGain);
		}
	}, [audioRef, ensureAudioGraph, volumeDb]);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		const context = ensureAudioGraph();
		if (!context || context.state !== "suspended") {
			return;
		}

		void context.resume().catch(() => undefined);
	}, [ensureAudioGraph, isPlaying]);

	useEffect(() => {
		return () => {
			audioContextRef.current = null;
			sourceNodeRef.current = null;
			gainNodeRef.current = null;
		};
	}, []);
}
