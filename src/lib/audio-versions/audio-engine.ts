interface AudioElementGraph {
	sourceNode: MediaElementAudioSourceNode;
	gainNode: GainNode;
}

type MobileAudioContextState = AudioContextState | "interrupted";

const audioGraphs = new Map<HTMLAudioElement, AudioElementGraph>();
const generationListeners = new Set<() => void>();

let sharedAudioContext: AudioContext | null = null;
let audioEngineGeneration = 0;
let rebuildPromise: Promise<void> | null = null;

function getAudioContextConstructor() {
	if (typeof window === "undefined") {
		return null;
	}

	return (
		window.AudioContext ||
		(window as Window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext ||
		null
	);
}

function getSharedAudioContext() {
	if (sharedAudioContext) {
		return sharedAudioContext;
	}

	const AudioContextConstructor = getAudioContextConstructor();
	if (!AudioContextConstructor) {
		return null;
	}

	sharedAudioContext = new AudioContextConstructor();
	return sharedAudioContext;
}

function disconnectAudioGraphs() {
	for (const graph of audioGraphs.values()) {
		graph.sourceNode.disconnect();
		graph.gainNode.disconnect();
	}
	audioGraphs.clear();
}

function notifyGenerationListeners() {
	for (const listener of generationListeners) {
		listener();
	}
}

async function closeContext(context: AudioContext | null) {
	if (!context || context.state === "closed") {
		return;
	}

	await context.close().catch(() => undefined);
}

export function getAudioEngineGeneration() {
	return audioEngineGeneration;
}

export function subscribeToAudioEngineGeneration(listener: () => void) {
	generationListeners.add(listener);
	return () => {
		generationListeners.delete(listener);
	};
}

export function connectAudioElement(element: HTMLAudioElement) {
	const existingGraph = audioGraphs.get(element);
	if (existingGraph) {
		return existingGraph;
	}

	const context = getSharedAudioContext();
	if (!context) {
		return null;
	}

	try {
		const sourceNode = context.createMediaElementSource(element);
		const gainNode = context.createGain();
		sourceNode.connect(gainNode);
		gainNode.connect(context.destination);

		const graph = { sourceNode, gainNode };
		audioGraphs.set(element, graph);
		element.volume = 1;
		return graph;
	} catch {
		return null;
	}
}

export function setAudioElementGain(element: HTMLAudioElement, gain: number) {
	const graph = connectAudioElement(element);
	if (!graph) {
		element.volume = Math.max(0, Math.min(1, gain));
		return;
	}

	graph.gainNode.gain.value = gain;
}

export function releaseAudioElement(element: HTMLAudioElement) {
	const graph = audioGraphs.get(element);
	if (!graph) {
		return;
	}

	graph.sourceNode.disconnect();
	graph.gainNode.disconnect();
	audioGraphs.delete(element);
}

async function rebuildSharedAudioContext() {
	if (rebuildPromise) {
		return rebuildPromise;
	}

	const previousContext = sharedAudioContext;
	sharedAudioContext = null;
	disconnectAudioGraphs();
	audioEngineGeneration += 1;
	notifyGenerationListeners();

	rebuildPromise = closeContext(previousContext).finally(() => {
		rebuildPromise = null;
	});
	return rebuildPromise;
}

export async function closeSharedAudioContext() {
	if (rebuildPromise) {
		await rebuildPromise;
	}

	const previousContext = sharedAudioContext;
	sharedAudioContext = null;
	disconnectAudioGraphs();
	await closeContext(previousContext);
}

export async function resumeSharedAudioContext() {
	const context = sharedAudioContext;
	if (!context) {
		return true;
	}

	const state = context.state as MobileAudioContextState;
	if (state === "closed" || state === "interrupted") {
		await rebuildSharedAudioContext();
		return false;
	}

	if (state === "running") {
		return true;
	}

	try {
		await context.resume();
	} catch {
		await rebuildSharedAudioContext();
		return false;
	}

	if ((context.state as MobileAudioContextState) !== "running") {
		await rebuildSharedAudioContext();
		return false;
	}

	return true;
}

export async function recoverSharedAudioContext() {
	const context = sharedAudioContext;
	if (!context) {
		return;
	}

	const resumed = await resumeSharedAudioContext();
	if (!resumed || sharedAudioContext !== context) {
		return;
	}

	const startTime = context.currentTime;
	await new Promise((resolve) => {
		setTimeout(resolve, 120);
	});

	if (
		sharedAudioContext === context &&
		(typeof document === "undefined" ||
			document.visibilityState === "visible") &&
		(context.state as MobileAudioContextState) === "running" &&
		context.currentTime <= startTime
	) {
		await rebuildSharedAudioContext();
	}
}
