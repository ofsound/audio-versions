// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { type CSSProperties, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WaveformData } from "#/lib/audio-versions/types";
import { useWaveformCanvas } from "./use-waveform-canvas";

const waveform: WaveformData = {
	peaks: [0.2, 0.6, 0.4],
	peakCount: 3,
	durationMs: 180000,
	sampleRate: 44100,
};

function WaveformCanvasHarness({
	currentTimeMs = 0,
}: {
	currentTimeMs?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);

	useWaveformCanvas({
		canvasRef,
		surfaceRef,
		waveform,
		currentTimeMs,
		isSelected: false,
	});

	return (
		<div
			ref={surfaceRef}
			data-testid="surface"
			style={
				{
					"--song-workspace-waveform-height": "92px",
					height: "var(--song-workspace-waveform-height)",
				} as CSSProperties
			}
		>
			<canvas ref={canvasRef} data-testid="canvas" />
		</div>
	);
}

describe("useWaveformCanvas", () => {
	beforeEach(() => {
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			get: () => 240,
		});
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			get: () => 92,
		});
		const contextStub = {
			beginPath: vi.fn(),
			clearRect: vi.fn(),
			drawImage: vi.fn(),
			fillRect: vi.fn(),
			lineTo: vi.fn(),
			moveTo: vi.fn(),
			setLineDash: vi.fn(),
			setTransform: vi.fn(),
			stroke: vi.fn(),
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
		} as unknown as CanvasRenderingContext2D;
		HTMLCanvasElement.prototype.getContext = vi.fn(
			() => contextStub,
		) as unknown as typeof HTMLCanvasElement.prototype.getContext;
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(private readonly callback: () => void) {}

				observe() {
					this.callback();
				}

				disconnect() {}
			},
		);
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
			() => undefined,
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("uses the configured waveform height preset for canvas drawing", async () => {
		render(<WaveformCanvasHarness />);

		await waitFor(() => {
			expect(screen.getByTestId("canvas")).toHaveProperty("height", 92);
			expect(
				(screen.getByTestId("canvas") as HTMLCanvasElement).style.height,
			).toBe("92px");
		});
	});

	it("redraws when the theme class on <html> changes", async () => {
		const clearRectSpy = vi.fn();
		const drawImageSpy = vi.fn();
		HTMLCanvasElement.prototype.getContext = vi.fn(
			() =>
				({
					beginPath: vi.fn(),
					clearRect: clearRectSpy,
					drawImage: drawImageSpy,
					fillRect: vi.fn(),
					lineTo: vi.fn(),
					moveTo: vi.fn(),
					setLineDash: vi.fn(),
					setTransform: vi.fn(),
					stroke: vi.fn(),
					fillStyle: "",
					strokeStyle: "",
					lineWidth: 1,
				}) as unknown as CanvasRenderingContext2D,
		) as unknown as typeof HTMLCanvasElement.prototype.getContext;

		render(<WaveformCanvasHarness />);

		await waitFor(() => {
			expect(clearRectSpy).toHaveBeenCalled();
		});

		const beforeThemeChange = clearRectSpy.mock.calls.length;
		document.documentElement.classList.remove("light");
		document.documentElement.classList.add("dark");

		await waitFor(() => {
			expect(clearRectSpy.mock.calls.length).toBeGreaterThan(beforeThemeChange);
		});

		document.documentElement.classList.remove("dark");
	});

	it("keeps observers stable while the playhead moves", async () => {
		const resizeObserverConstructor = vi.fn(
			(callback: () => void) =>
				new (class {
					constructor(private readonly innerCallback: () => void) {}

					observe() {
						this.innerCallback();
					}

					disconnect() {}
				})(callback),
		);
		vi.stubGlobal("ResizeObserver", resizeObserverConstructor);

		const { container, rerender } = render(
			<WaveformCanvasHarness currentTimeMs={0} />,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid='canvas']")).toHaveProperty(
				"height",
				92,
			);
		});

		rerender(<WaveformCanvasHarness currentTimeMs={3200} />);
		rerender(<WaveformCanvasHarness currentTimeMs={6400} />);

		expect(resizeObserverConstructor).toHaveBeenCalledTimes(1);
	});
});
