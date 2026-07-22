// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	closeSharedAudioContext,
	connectAudioElement,
	getAudioEngineGeneration,
	recoverSharedAudioContext,
	resumeSharedAudioContext,
	setAudioElementGain,
	subscribeToAudioEngineGeneration,
} from "./audio-engine";

class MockAudioContext {
	static instances: MockAudioContext[] = [];

	readonly destination = {};
	readonly gainNodes: Array<{
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
		gain: { value: number };
	}> = [];
	readonly sourceNodes: Array<{
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	}> = [];
	currentTime = 1;
	state: AudioContextState | "interrupted" = "running";
	close = vi.fn(async () => {
		this.state = "closed";
	});
	resume = vi.fn(async () => {
		this.state = "running";
	});

	constructor() {
		MockAudioContext.instances.push(this);
	}

	createMediaElementSource() {
		const node = {
			connect: vi.fn(),
			disconnect: vi.fn(),
		};
		this.sourceNodes.push(node);
		return node;
	}

	createGain() {
		const node = {
			connect: vi.fn(),
			disconnect: vi.fn(),
			gain: { value: 0 },
		};
		this.gainNodes.push(node);
		return node;
	}
}

describe("shared audio engine", () => {
	beforeEach(() => {
		MockAudioContext.instances = [];
		vi.stubGlobal("AudioContext", MockAudioContext);
		vi.stubGlobal("webkitAudioContext", MockAudioContext);
	});

	afterEach(async () => {
		await closeSharedAudioContext();
		vi.unstubAllGlobals();
	});

	it("uses one AudioContext for every media element", () => {
		const firstElement = document.createElement("audio");
		const secondElement = document.createElement("audio");

		connectAudioElement(firstElement);
		connectAudioElement(secondElement);
		setAudioElementGain(firstElement, 0.5);
		setAudioElementGain(secondElement, 0.75);

		expect(MockAudioContext.instances).toHaveLength(1);
		expect(MockAudioContext.instances[0]?.sourceNodes).toHaveLength(2);
		expect(MockAudioContext.instances[0]?.gainNodes[0]?.gain.value).toBe(0.5);
		expect(MockAudioContext.instances[0]?.gainNodes[1]?.gain.value).toBe(0.75);
	});

	it("resumes a suspended context as soon as playback requests it", async () => {
		connectAudioElement(document.createElement("audio"));
		const context = MockAudioContext.instances[0];
		if (!context) {
			throw new Error("Expected a shared audio context.");
		}
		context.state = "suspended";

		const resumePromise = resumeSharedAudioContext();
		expect(context.resume).toHaveBeenCalledTimes(1);
		expect(await resumePromise).toBe(true);
	});

	it("closes an interrupted context and announces a remount generation", async () => {
		connectAudioElement(document.createElement("audio"));
		const context = MockAudioContext.instances[0];
		if (!context) {
			throw new Error("Expected a shared audio context.");
		}
		context.state = "interrupted";
		const previousGeneration = getAudioEngineGeneration();
		const generationListener = vi.fn();
		const unsubscribe = subscribeToAudioEngineGeneration(generationListener);

		await recoverSharedAudioContext();

		expect(context.close).toHaveBeenCalledTimes(1);
		expect(getAudioEngineGeneration()).toBe(previousGeneration + 1);
		expect(generationListener).toHaveBeenCalledTimes(1);

		connectAudioElement(document.createElement("audio"));
		expect(MockAudioContext.instances).toHaveLength(2);
		unsubscribe();
	});
});
