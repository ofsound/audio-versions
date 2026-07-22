// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EMPTY_RICH_TEXT,
	plainTextToRichText,
} from "#/lib/version-compare/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/version-compare/types";
import { WaveformCard } from "./waveform-card";

vi.mock("#/providers/theme-provider", () => ({
	useTheme: () => ({
		theme: "light",
	}),
}));

const createObjectURLMock = vi.fn(() => "blob:waveform-card-test");
const revokeObjectURLMock = vi.fn();

class MockAudioContext {
	static instances: MockAudioContext[] = [];

	public readonly destination = {};
	public readonly sourceNode = {
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
	public readonly gainNode = {
		connect: vi.fn(),
		disconnect: vi.fn(),
		gain: {
			value: 0,
		},
	};
	public state: AudioContextState = "running";
	public close = vi.fn().mockResolvedValue(undefined);
	public resume = vi.fn().mockResolvedValue(undefined);

	constructor() {
		MockAudioContext.instances.push(this);
	}

	createMediaElementSource() {
		return this.sourceNode;
	}

	createGain() {
		return this.gainNode;
	}
}

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: "song-1",
		title: "Mix v1",
		sessionDate: "2026-04-16",
		notes: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 180000,
		waveform: {
			peaks: [0.2, 0.6, 0.4],
			peakCount: 3,
			durationMs: 180000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function renderWaveformCard({
	audioFile = createAudioFile(),
	annotations = [],
	currentTimeMs = 0,
	isPlaying = false,
	onCreateAnnotation = vi.fn(
		async (input: Omit<CreateAnnotationInput, "songId" | "audioFileId">) =>
			({
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "file-1",
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
				...input,
			}) as Annotation,
	),
	onSeek = vi.fn().mockResolvedValue(undefined),
	onUpdateAnnotation = vi.fn().mockResolvedValue(undefined),
	onDeleteAnnotation = vi.fn().mockResolvedValue(undefined),
	onOpenFileDetails = vi.fn(),
	onSelectFile = vi.fn(),
	onSelectAnnotation = vi.fn(),
	onDragStart = vi.fn(),
	onStepVolume = vi.fn().mockResolvedValue(undefined),
	onReportPlayback = vi.fn(),
}: {
	audioFile?: AudioFileRecord;
	annotations?: Annotation[];
	currentTimeMs?: number;
	isPlaying?: boolean;
	onCreateAnnotation?: (
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	onSeek?: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onUpdateAnnotation?: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation?: (annotationId: string) => Promise<void>;
	onOpenFileDetails?: (fileId: string) => void;
	onSelectFile?: (fileId: string) => void;
	onSelectAnnotation?: (annotationId: string) => void;
	onDragStart?: () => void;
	onStepVolume?: (deltaDb: number) => Promise<void>;
	onReportPlayback?: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
} = {}) {
	return render(
		<WaveformCard
			audioFile={audioFile}
			annotations={annotations}
			blob={new Blob(["tone"], { type: "audio/wav" })}
			currentTimeMs={currentTimeMs}
			isPlaying={isPlaying}
			isSelected
			onSelectFile={onSelectFile}
			onSelectAnnotation={onSelectAnnotation}
			onCreateAnnotation={onCreateAnnotation}
			onUpdateAnnotation={onUpdateAnnotation}
			onDeleteAnnotation={onDeleteAnnotation}
			onSeek={onSeek}
			onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
			onRegisterAudioElement={vi.fn()}
			onReportPlayback={onReportPlayback}
			onStepVolume={onStepVolume}
			onOpenFileDetails={onOpenFileDetails}
			onDragStart={onDragStart}
			onDragEnd={vi.fn()}
			onDrop={vi.fn()}
		/>,
	);
}

function getEditDetailsButton(title: string) {
	return screen.getByRole("button", {
		name: new RegExp(`^edit details for ${title}$`, "i"),
	});
}

const WAVEFORM_MARKER_GUTTER_HEIGHT_PX = 16.5;

function mockWaveformBounds(
	element: HTMLElement,
	{
		left = 0,
		width = 200,
		height = 164,
	}: { left?: number; width?: number; height?: number } = {},
) {
	const shellHeight = height + 2 * WAVEFORM_MARKER_GUTTER_HEIGHT_PX;
	Object.defineProperty(element, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			left,
			top: 0,
			right: left + width,
			bottom: shellHeight,
			width,
			height: shellHeight,
			x: left,
			y: 0,
			toJSON: () => ({}),
		}),
	});
	Object.defineProperty(element, "clientWidth", {
		configurable: true,
		value: width,
	});
	Object.defineProperty(element, "clientHeight", {
		configurable: true,
		value: shellHeight,
	});

	const canvasSurface = element.querySelector(
		'[data-testid="waveform-canvas-surface"]',
	);
	if (canvasSurface instanceof HTMLElement) {
		const canvasTop = WAVEFORM_MARKER_GUTTER_HEIGHT_PX;
		const canvasBottom = WAVEFORM_MARKER_GUTTER_HEIGHT_PX + height;
		Object.defineProperty(canvasSurface, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				left,
				top: canvasTop,
				right: left + width,
				bottom: canvasBottom,
				width,
				height,
				x: left,
				y: canvasTop,
				toJSON: () => ({}),
			}),
		});
		Object.defineProperty(canvasSurface, "clientWidth", {
			configurable: true,
			value: width,
		});
		Object.defineProperty(canvasSurface, "clientHeight", {
			configurable: true,
			value: height,
		});
	}

	const annotationOverlay = element.querySelector(
		'[data-testid="waveform-annotation-overlay"]',
	);
	if (annotationOverlay instanceof HTMLElement) {
		Object.defineProperty(annotationOverlay, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				left,
				top: 0,
				right: left + width,
				bottom: shellHeight,
				width,
				height: shellHeight,
				x: left,
				y: 0,
				toJSON: () => ({}),
			}),
		});
		Object.defineProperty(annotationOverlay, "clientWidth", {
			configurable: true,
			value: width,
		});
		Object.defineProperty(annotationOverlay, "clientHeight", {
			configurable: true,
			value: shellHeight,
		});
	}
}

describe("WaveformCard", () => {
	beforeEach(() => {
		MockAudioContext.instances = [];
		vi.stubGlobal("AudioContext", MockAudioContext);
		vi.stubGlobal("webkitAudioContext", MockAudioContext);
		vi.stubGlobal(
			"ResizeObserver",
			class {
				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: createObjectURLMock,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: revokeObjectURLMock,
		});
		createObjectURLMock.mockClear();
		revokeObjectURLMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows the volume stepper and disables buttons at the configured bounds", async () => {
		const onStepVolume = vi.fn().mockResolvedValue(undefined);
		const { rerender } = renderWaveformCard({
			audioFile: createAudioFile({ volumeDb: 12 }),
			onStepVolume,
		});
		const decreaseButton = screen.getByRole("button", {
			name: /decrease volume for mix v1/i,
		}) as HTMLButtonElement;
		const increaseButton = screen.getByRole("button", {
			name: /increase volume for mix v1/i,
		}) as HTMLButtonElement;

		expect(screen.getByText("+12 dB")).toBeTruthy();
		expect(decreaseButton.disabled).toBe(false);
		expect(increaseButton.disabled).toBe(true);

		fireEvent.click(decreaseButton);

		await waitFor(() => {
			expect(onStepVolume).toHaveBeenCalledWith(-1);
		});

		rerender(
			<WaveformCard
				audioFile={createAudioFile({ volumeDb: -12 })}
				annotations={[]}
				blob={new Blob(["tone"], { type: "audio/wav" })}
				currentTimeMs={0}
				isPlaying={false}
				isSelected
				onSelectFile={vi.fn()}
				onSelectAnnotation={vi.fn()}
				onCreateAnnotation={vi.fn().mockResolvedValue({
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 0,
					title: "Marker 0:00",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				})}
				onUpdateAnnotation={vi.fn().mockResolvedValue(undefined)}
				onDeleteAnnotation={vi.fn().mockResolvedValue(undefined)}
				onSeek={vi.fn().mockResolvedValue(undefined)}
				onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
				onRegisterAudioElement={vi.fn()}
				onReportPlayback={vi.fn()}
				onStepVolume={onStepVolume}
				onOpenFileDetails={vi.fn()}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onDrop={vi.fn()}
			/>,
		);

		expect(screen.getByText("-12 dB")).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: /decrease volume for mix v1/i,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("updates the gain node when the stored decibel value changes", async () => {
		const { rerender } = renderWaveformCard({
			audioFile: createAudioFile({ volumeDb: 0 }),
		});

		await waitFor(() => {
			expect(MockAudioContext.instances).toHaveLength(1);
		});

		expect(MockAudioContext.instances[0]?.gainNode.gain.value).toBe(1);

		rerender(
			<WaveformCard
				audioFile={createAudioFile({ volumeDb: 6 })}
				annotations={[]}
				blob={new Blob(["tone"], { type: "audio/wav" })}
				currentTimeMs={0}
				isPlaying={false}
				isSelected
				onSelectFile={vi.fn()}
				onSelectAnnotation={vi.fn()}
				onCreateAnnotation={vi.fn().mockResolvedValue({
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 0,
					title: "Marker 0:00",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				})}
				onUpdateAnnotation={vi.fn().mockResolvedValue(undefined)}
				onDeleteAnnotation={vi.fn().mockResolvedValue(undefined)}
				onSeek={vi.fn().mockResolvedValue(undefined)}
				onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
				onRegisterAudioElement={vi.fn()}
				onReportPlayback={vi.fn()}
				onStepVolume={vi.fn().mockResolvedValue(undefined)}
				onOpenFileDetails={vi.fn()}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onDrop={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(MockAudioContext.instances[0]?.gainNode.gain.value).toBeCloseTo(
				1.995,
				3,
			);
		});
	});

	it("requests audio with CORS enabled for Web Audio playback", () => {
		renderWaveformCard();

		const audioElement = document.querySelector("audio");
		expect(audioElement?.crossOrigin).toBe("anonymous");
	});

	it("commits seek on pointer up and uses autoplay on waveform double-click", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onReportPlayback = vi.fn();

		renderWaveformCard({
			onSeek,
			onSelectFile,
			onReportPlayback,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });
		const audioElement = document.querySelector("audio");
		expect(audioElement).toBeTruthy();

		fireEvent.pointerDown(waveformSurface, {
			button: 0,
			pointerId: 3,
			clientX: 60,
			clientY: 90,
			detail: 1,
		});
		fireEvent.pointerMove(waveformSurface, {
			pointerId: 3,
			clientX: 80,
			clientY: 90,
		});

		expect(onSeek).not.toHaveBeenCalled();
		expect(onReportPlayback).toHaveBeenNthCalledWith(1, {
			currentTimeMs: 45000,
		});
		expect(onReportPlayback).toHaveBeenNthCalledWith(2, {
			currentTimeMs: 63000,
		});
		expect((audioElement as HTMLAudioElement).currentTime).toBe(63);

		fireEvent.pointerUp(waveformSurface, {
			pointerId: 3,
			clientX: 80,
			clientY: 90,
			detail: 1,
		});

		await waitFor(() => {
			expect(onSeek).toHaveBeenCalledWith(63000, false);
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectFile).toHaveBeenCalledTimes(1);

		fireEvent.pointerDown(waveformSurface, {
			button: 0,
			pointerId: 4,
			clientX: 160,
			clientY: 90,
		});
		fireEvent.pointerUp(waveformSurface, {
			pointerId: 4,
			clientX: 160,
			clientY: 90,
		});
		fireEvent.doubleClick(waveformSurface, {
			clientX: 160,
			clientY: 90,
		});

		await waitFor(() => {
			expect(onSeek).toHaveBeenNthCalledWith(3, 135000, true);
		});
	});

	it("resets the playhead to the start without enabling autoplay", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();

		renderWaveformCard({
			onSeek,
			onSelectFile,
			isPlaying: true,
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: /reset playhead for mix v1/i,
			}),
		);

		await waitFor(() => {
			expect(onSeek).toHaveBeenCalledWith(0, false);
		});
		expect(onSeek).toHaveBeenCalledTimes(1);
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
	});

	it("shows the top gutter add-marker icon while hovering", () => {
		renderWaveformCard({
			currentTimeMs: 45000,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });

		const topGutter = screen.getByTestId("waveform-gutter-top");
		expect(screen.queryByTestId("gutter-add-marker-icon")).toBeNull();

		fireEvent.pointerEnter(topGutter, { clientX: 60, clientY: 8 });
		expect(screen.getByTestId("gutter-add-marker-icon")).toBeTruthy();

		fireEvent.pointerLeave(topGutter);
		expect(screen.queryByTestId("gutter-add-marker-icon")).toBeNull();
	});

	it("creates a point marker from a top gutter click", async () => {
		const onCreateAnnotation = vi.fn().mockResolvedValue({
			id: "annotation-9",
			songId: "song-1",
			audioFileId: "file-1",
			type: "point",
			startMs: 45000,
			title: "Marker 0:45",
			body: EMPTY_RICH_TEXT,
			color: "var(--color-marker-point)",
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-16T00:00:00.000Z",
		} satisfies Annotation);
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onSelectAnnotation = vi.fn();

		renderWaveformCard({
			currentTimeMs: 45000,
			onCreateAnnotation,
			onSeek,
			onSelectFile,
			onSelectAnnotation,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });
		fireEvent.click(screen.getByTestId("waveform-gutter-top"), {
			clientX: 60,
			clientY: 8,
		});

		await waitFor(() => {
			expect(onCreateAnnotation).toHaveBeenCalledWith({
				type: "point",
				startMs: 45000,
				title: "Marker 0:45",
				body: EMPTY_RICH_TEXT,
				color: "var(--color-marker-point)",
			});
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-9");
		expect(onSeek).not.toHaveBeenCalled();
	});

	it("creates a 10-second range from a bottom gutter tap without dragging", async () => {
		const onCreateAnnotation = vi.fn().mockResolvedValue({
			id: "annotation-10",
			songId: "song-1",
			audioFileId: "file-1",
			type: "range",
			startMs: 45000,
			endMs: 55000,
			title: "Range 0:45",
			body: EMPTY_RICH_TEXT,
			color: "var(--color-marker-range)",
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-16T00:00:00.000Z",
		} satisfies Annotation);
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onSelectAnnotation = vi.fn();

		renderWaveformCard({
			currentTimeMs: 45000,
			onCreateAnnotation,
			onSeek,
			onSelectFile,
			onSelectAnnotation,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });
		const bottomGutter = screen.getByTestId("waveform-gutter-bottom");
		fireEvent.pointerDown(bottomGutter, {
			button: 0,
			pointerId: 7,
			clientX: 60,
			clientY: 190,
		});
		fireEvent.pointerUp(bottomGutter, {
			pointerId: 7,
			clientX: 60,
			clientY: 190,
		});

		await waitFor(() => {
			expect(onCreateAnnotation).toHaveBeenCalledWith({
				type: "range",
				startMs: 45000,
				endMs: 55000,
				title: "Range 0:45",
				body: EMPTY_RICH_TEXT,
				color: "var(--color-marker-range)",
			});
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-10");
		expect(onSeek).not.toHaveBeenCalled();
	});

	it("removes the legacy waveform mode selectors but exposes header quick-add buttons", () => {
		renderWaveformCard({
			currentTimeMs: 45000,
		});

		expect(
			screen.getByRole("button", {
				name: /add marker at playhead/i,
			}).className,
		).toContain("action-secondary");
		expect(
			screen.getByRole("button", {
				name: /start range at playhead/i,
			}).className,
		).toContain("action-secondary");
		expect(
			screen.queryByRole("button", {
				name: /^seek$/i,
			}),
		).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: /^point$/i,
			}),
		).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: /^range$/i,
			}),
		).toBeNull();
		expect(
			screen.getByRole("button", {
				name: /add marker at playhead/i,
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("button", {
				name: /start range at playhead/i,
			}),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: /end range at playhead/i,
			}),
		).toBeNull();
	});

	it("opens file details from the gear button in the title row", () => {
		const onOpenFileDetails = vi.fn();

		renderWaveformCard({
			onOpenFileDetails,
		});

		const editDetailsButton = getEditDetailsButton("Mix v1");
		expect(editDetailsButton.className).toContain("icon-button");
		fireEvent.click(editDetailsButton);

		expect(onOpenFileDetails).toHaveBeenCalledWith("file-1");
	});

	it("selects the file when clicking non-interactive row space", () => {
		const onSelectFile = vi.fn();

		renderWaveformCard({
			onSelectFile,
		});

		fireEvent.pointerDown(screen.getByRole("article"));
		expect(onSelectFile).toHaveBeenCalledTimes(1);
		expect(onSelectFile).toHaveBeenCalledWith("file-1");

		fireEvent.click(
			screen.getByRole("button", {
				name: /^play$/i,
			}),
		);
		expect(onSelectFile).toHaveBeenCalledTimes(2);
	});

	it("arms row dragging from the handle and uses the full row as the drag image", () => {
		const onDragStart = vi.fn();

		renderWaveformCard({
			onDragStart,
		});

		const waveformCard = screen.getByRole("article");
		const dragHandle = screen.getByRole("button", {
			name: /reorder mix v1/i,
		});
		expect(dragHandle.className).toContain("icon-button");
		mockWaveformBounds(waveformCard, { left: 10, width: 240 });
		const dataTransfer = {
			effectAllowed: "none",
			setData: vi.fn(),
			setDragImage: vi.fn(),
		};

		fireEvent.pointerDown(dragHandle, { clientX: 46, clientY: 22 });

		expect(waveformCard).toHaveProperty("draggable", true);

		fireEvent.dragStart(waveformCard, {
			dataTransfer,
			clientX: 46,
			clientY: 22,
		});

		expect(dataTransfer.effectAllowed).toBe("move");
		expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "file-1");
		expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
			waveformCard,
			24,
			24,
		);
		expect(onDragStart).toHaveBeenCalledTimes(1);

		fireEvent.dragEnd(waveformCard);
		expect(waveformCard).toHaveProperty("draggable", false);
	});

	it("seeks to center on Enter and ignores Space key presses", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onSeek,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });

		fireEvent.keyDown(waveformSurface, { key: " " });
		expect(onSeek).not.toHaveBeenCalled();

		fireEvent.keyDown(waveformSurface, { key: "Enter" });

		await waitFor(() => {
			expect(onSeek).toHaveBeenCalledWith(90000);
		});
	});

	it("ignores waveform double-click playback when the event originates from an annotation hit", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onSeek,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		fireEvent.doubleClick(
			screen.getByRole("button", {
				name: /verse at 0:30/i,
			}),
			{
				clientX: 160,
			},
		);

		await waitFor(() => {
			expect(onSeek).not.toHaveBeenCalled();
		});
	});

	it("shows a custom tooltip when hovering a marker handle", () => {
		renderWaveformCard({
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: plainTextToRichText("Lead vocal starts"),
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		expect(markerHandle).toBeTruthy();

		fireEvent.pointerEnter(markerHandle as Element, {
			clientX: 40,
			clientY: 30,
		});

		const markerDescription = screen.getByText("Lead vocal starts");
		const markerTooltip = markerDescription.closest(
			".waveform-annotation-tooltip",
		);
		expect(markerTooltip).toBeTruthy();
		expect(within(markerTooltip as HTMLElement).getByText("0:30")).toBeTruthy();
		expect(
			within(markerTooltip as HTMLElement).getByText("Verse"),
		).toBeTruthy();
		expect(markerDescription).toBeTruthy();

		fireEvent.pointerLeave(markerHandle as Element);
		expect(screen.queryByText("Lead vocal starts")).toBeNull();
	});

	it("shows a custom tooltip when hovering a range in the bottom gutter", () => {
		renderWaveformCard({
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: plainTextToRichText("Main hook"),
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 220 });

		const rangeGutterButton = screen.getByRole("button", {
			name: /^Chorus at 0:30 - 0:45 — gutter$/i,
		});

		fireEvent.pointerEnter(rangeGutterButton, {
			clientX: 100,
			clientY: 50,
		});

		const rangeDescription = screen.getByText("Main hook");
		const rangeTooltip = rangeDescription.closest(
			".waveform-annotation-tooltip",
		);
		expect(rangeTooltip).toBeTruthy();
		expect(
			within(rangeTooltip as HTMLElement).getByText("0:30 - 0:45"),
		).toBeTruthy();
		expect(
			within(rangeTooltip as HTMLElement).getByText("Chorus"),
		).toBeTruthy();
		expect(rangeDescription).toBeTruthy();

		fireEvent.pointerLeave(rangeGutterButton);
		expect(screen.queryByText("Main hook")).toBeNull();
	});

	it("does not show a range tooltip when hovering the main waveform strip", () => {
		renderWaveformCard({
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: plainTextToRichText("Main hook"),
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 220 });

		const rangeWaveformHighlight = screen
			.getByTestId("waveform-annotation-overlay")
			.querySelector("[data-range-waveform-highlight]");
		expect(rangeWaveformHighlight).toBeTruthy();

		fireEvent.pointerEnter(rangeWaveformHighlight as Element, {
			clientX: 100,
			clientY: 50,
		});

		expect(screen.queryByText("Main hook")).toBeNull();
	});

	it("drags the start handle of a range horizontally", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onSelectAnnotation = vi.fn();

		renderWaveformCard({
			onUpdateAnnotation,
			onSelectFile,
			onSelectAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const startHandleButton = screen.getByRole("button", {
			name: /adjust start of chorus/i,
		});
		const startHandle = startHandleButton.querySelector(
			'[data-range-handle="start"]',
		);
		expect(startHandle).toBeTruthy();

		fireEvent.pointerDown(startHandle as Element, {
			button: 0,
			pointerId: 10,
			clientX: 40,
		});
		fireEvent.pointerMove(startHandleButton, {
			pointerId: 10,
			clientX: 50,
		});
		fireEvent.pointerUp(startHandleButton, {
			pointerId: 10,
			clientX: 50,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 40000,
			});
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-1");
	});

	it("slows end-handle dragging for a range while Shift is held", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onUpdateAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const endHandleButton = screen.getByRole("button", {
			name: /adjust end of chorus/i,
		});
		const endHandle = endHandleButton.querySelector(
			'[data-range-handle="end"]',
		);
		expect(endHandle).toBeTruthy();

		fireEvent.pointerDown(endHandle as Element, {
			button: 0,
			pointerId: 11,
			clientX: 55,
		});
		fireEvent.pointerMove(endHandleButton, {
			pointerId: 11,
			clientX: 75,
			shiftKey: true,
		});
		fireEvent.pointerUp(endHandleButton, {
			pointerId: 11,
			clientX: 75,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				endMs: 50000,
			});
		});
	});

	it("drags point markers horizontally from the marker handle", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onSelectAnnotation = vi.fn();

		renderWaveformCard({
			onUpdateAnnotation,
			onSeek,
			onSelectFile,
			onSelectAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		expect(markerHandle).toBeTruthy();
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 7,
			clientX: 40,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 7,
			clientX: 60,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 7,
			clientX: 60,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 50000,
			});
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-1");

		fireEvent.click(markerButton);
		expect(onSeek).not.toHaveBeenCalled();
	});

	it("slows marker dragging while Shift is held", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onUpdateAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		expect(markerHandle).toBeTruthy();
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 8,
			clientX: 40,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 8,
			clientX: 60,
			shiftKey: true,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 8,
			clientX: 60,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 35000,
			});
		});
	});

	it("still drags a point marker after its tooltip hover is shown", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onUpdateAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: plainTextToRichText("Lead vocal starts"),
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		expect(markerHandle).toBeTruthy();
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerEnter(markerHandle as Element, {
			clientX: 40,
			clientY: 30,
		});
		expect(screen.getByText("Lead vocal starts")).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 9,
			clientX: 40,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 9,
			clientX: 60,
			shiftKey: true,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 9,
			clientX: 60,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 35000,
			});
		});
		expect(screen.queryByText("Lead vocal starts")).toBeNull();
	});

	it("prompts to delete a point marker when dropped more than 30px away vertically", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		renderWaveformCard({
			onUpdateAnnotation,
			onDeleteAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 21,
			clientX: 40,
			clientY: 12,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 21,
			clientX: 60,
			clientY: 60,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 21,
			clientX: 60,
			clientY: 60,
		});

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		});
		expect(onUpdateAnnotation).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(onDeleteAnnotation).toHaveBeenCalledWith("annotation-1");
		});
	});

	it("restores a point marker without deleting it when the delete confirmation is cancelled", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		renderWaveformCard({
			onUpdateAnnotation,
			onDeleteAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 22,
			clientX: 40,
			clientY: 12,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 22,
			clientX: 55,
			clientY: 80,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 22,
			clientX: 55,
			clientY: 80,
		});

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		});
		expect(onUpdateAnnotation).not.toHaveBeenCalled();
		expect(onDeleteAnnotation).not.toHaveBeenCalled();
	});

	it("does not prompt to delete a point marker when the vertical drop is within the threshold", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		renderWaveformCard({
			onUpdateAnnotation,
			onDeleteAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-point)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const markerButton = screen.getByRole("button", {
			name: /verse at 0:30/i,
		});
		const markerHandle = markerButton.querySelector("[data-marker-handle]");
		const markerHandleSvg = markerHandle?.querySelector("svg");
		expect(markerHandleSvg).toBeTruthy();

		fireEvent.pointerDown(markerHandleSvg as Element, {
			button: 0,
			pointerId: 23,
			clientX: 40,
			clientY: 30,
		});
		fireEvent.pointerMove(markerButton, {
			pointerId: 23,
			clientX: 60,
			clientY: 50,
		});
		fireEvent.pointerUp(markerButton, {
			pointerId: 23,
			clientX: 60,
			clientY: 50,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 50000,
			});
		});
		expect(confirmSpy).not.toHaveBeenCalled();
		expect(onDeleteAnnotation).not.toHaveBeenCalled();
	});

	it("translates the entire range when dragging the colored body horizontally", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();
		const onSelectAnnotation = vi.fn();
		const onSeek = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onUpdateAnnotation,
			onSelectFile,
			onSelectAnnotation,
			onSeek,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const rangeBodyButton = screen.getByRole("button", {
			name: /^Chorus at 0:30 - 0:45 — gutter$/i,
		});

		fireEvent.pointerDown(rangeBodyButton, {
			button: 0,
			pointerId: 30,
			clientX: 50,
			clientY: 180,
		});
		fireEvent.pointerMove(rangeBodyButton, {
			pointerId: 30,
			clientX: 70,
			clientY: 180,
		});
		fireEvent.pointerUp(rangeBodyButton, {
			pointerId: 30,
			clientX: 70,
			clientY: 180,
		});
		fireEvent.click(rangeBodyButton, {
			clientX: 70,
			clientY: 180,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 50000,
				endMs: 65000,
			});
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");
		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-1");
		expect(onSeek).not.toHaveBeenCalled();
	});

	it("clamps a range translation so neither edge crosses the audio bounds", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onUpdateAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const rangeBodyButton = screen.getByRole("button", {
			name: /^Chorus at 0:30 - 0:45 — gutter$/i,
		});

		fireEvent.pointerDown(rangeBodyButton, {
			button: 0,
			pointerId: 31,
			clientX: 50,
			clientY: 180,
		});
		fireEvent.pointerMove(rangeBodyButton, {
			pointerId: 31,
			clientX: 10,
			clientY: 180,
		});
		fireEvent.pointerUp(rangeBodyButton, {
			pointerId: 31,
			clientX: 10,
			clientY: 180,
		});

		await waitFor(() => {
			expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
				startMs: 0,
				endMs: 15000,
			});
		});
	});

	it("prompts to delete a range when its colored body is dropped vertically", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		renderWaveformCard({
			onUpdateAnnotation,
			onDeleteAnnotation,
			onSeek,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const rangeBodyButton = screen.getByRole("button", {
			name: /^Chorus at 0:30 - 0:45 — gutter$/i,
		});

		fireEvent.pointerDown(rangeBodyButton, {
			button: 0,
			pointerId: 25,
			clientX: 80,
			clientY: 180,
		});
		fireEvent.pointerMove(rangeBodyButton, {
			pointerId: 25,
			clientX: 80,
			clientY: 110,
		});
		fireEvent.pointerUp(rangeBodyButton, {
			pointerId: 25,
			clientX: 80,
			clientY: 110,
		});
		fireEvent.click(rangeBodyButton, {
			clientX: 80,
			clientY: 110,
		});

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		});
		await waitFor(() => {
			expect(onDeleteAnnotation).toHaveBeenCalledWith("annotation-1");
		});
		expect(onUpdateAnnotation).not.toHaveBeenCalled();
		expect(onSeek).not.toHaveBeenCalled();
	});

	it("prompts to delete the parent range when a range edge is dropped vertically", async () => {
		const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
		const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		renderWaveformCard({
			onUpdateAnnotation,
			onDeleteAnnotation,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 30000,
					endMs: 45000,
					title: "Chorus",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-marker-range)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 180 });

		const endHandleButton = screen.getByRole("button", {
			name: /adjust end of chorus/i,
		});
		const endHandle = endHandleButton.querySelector(
			'[data-range-handle="end"]',
		);
		expect(endHandle).toBeTruthy();

		fireEvent.pointerDown(endHandle as Element, {
			button: 0,
			pointerId: 24,
			clientX: 55,
			clientY: 12,
		});
		fireEvent.pointerMove(endHandleButton, {
			pointerId: 24,
			clientX: 65,
			clientY: 70,
		});
		fireEvent.pointerUp(endHandleButton, {
			pointerId: 24,
			clientX: 65,
			clientY: 70,
		});

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		});
		expect(onUpdateAnnotation).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(onDeleteAnnotation).toHaveBeenCalledWith("annotation-1");
		});
	});
});
