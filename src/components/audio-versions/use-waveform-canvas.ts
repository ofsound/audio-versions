import { type MutableRefObject, useEffect, useRef } from "react";
import type { WaveformData } from "#/lib/audio-versions/types";
import { getWaveformHeightPx } from "#/lib/audio-versions/ui-settings";

interface UseWaveformCanvasOptions {
	canvasRef: MutableRefObject<HTMLCanvasElement | null>;
	surfaceRef: MutableRefObject<HTMLDivElement | null>;
	waveform: WaveformData;
	currentTimeMs: number;
	isSelected: boolean;
}

export function useWaveformCanvas({
	canvasRef,
	surfaceRef,
	waveform,
	currentTimeMs,
	isSelected,
}: UseWaveformCanvasOptions) {
	const currentTimeRef = useRef(currentTimeMs);
	const redrawProgressRef = useRef<(timeMs: number) => void>(() => undefined);

	useEffect(() => {
		currentTimeRef.current = currentTimeMs;
		redrawProgressRef.current(currentTimeMs);
	}, [currentTimeMs]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const surface = surfaceRef.current;
		if (!canvas || !surface) {
			return;
		}

		const context = canvas.getContext("2d");
		const staticCanvas = document.createElement("canvas");
		const staticContext = staticCanvas.getContext("2d");
		if (!context || !staticContext) {
			return;
		}
		const colorProbe = document.createElement("span");
		colorProbe.setAttribute("aria-hidden", "true");
		colorProbe.style.position = "absolute";
		colorProbe.style.width = "0";
		colorProbe.style.height = "0";
		colorProbe.style.overflow = "hidden";
		colorProbe.style.pointerEvents = "none";
		colorProbe.style.visibility = "hidden";
		surface.append(colorProbe);

		interface WaveformCanvasColors {
			base: string;
			grid: string;
			progress: string;
			progressLine: string;
			selected: string;
			surface: string;
		}

		interface WaveformCanvasLayout {
			colors: WaveformCanvasColors;
			height: number;
			ratio: number;
			width: number;
		}

		let layout: WaveformCanvasLayout | null = null;
		let frameId = 0;

		const readCanvasColors = (): WaveformCanvasColors => {
			const readColor = (name: string) => {
				// Custom properties preserve their authored value, so `light-dark(...)`
				// must be resolved through a real CSS property before canvas can use it.
				colorProbe.style.color = `var(${name})`;
				return window.getComputedStyle(colorProbe).color || "transparent";
			};

			return {
				base: readColor("--color-waveform-base"),
				grid: readColor("--color-waveform-grid"),
				progress: readColor("--color-waveform-progress"),
				progressLine: readColor("--color-waveform-progress-line"),
				selected: readColor("--color-waveform-selected"),
				surface: readColor("--color-waveform-surface"),
			};
		};

		const readHeight = (): number => {
			const measuredHeight = Math.round(surface.clientHeight);
			if (measuredHeight > 0) {
				return measuredHeight;
			}

			const parsedHeight = Number.parseInt(
				window
					.getComputedStyle(surface)
					.getPropertyValue("--song-workspace-waveform-height"),
				10,
			);
			return Number.isFinite(parsedHeight)
				? parsedHeight
				: getWaveformHeightPx("large");
		};

		const redrawProgress = (timeMs: number) => {
			if (!layout) {
				return;
			}

			const { colors, height, ratio, width } = layout;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);
			context.drawImage(staticCanvas, 0, 0, width, height);

			const progressX = Math.max(
				0,
				Math.min(width, width * (timeMs / Math.max(waveform.durationMs, 1))),
			);
			context.fillStyle = colors.progress;
			context.fillRect(0, 0, progressX, height);
			context.strokeStyle = colors.progressLine;
			context.lineWidth = 2;
			context.lineCap = "butt";
			context.beginPath();
			context.moveTo(progressX, 0);
			context.lineTo(progressX, height);
			context.stroke();
		};

		redrawProgressRef.current = redrawProgress;

		const redrawWaveform = () => {
			const width = Math.round(surface.clientWidth);
			if (width <= 0) {
				return false;
			}

			const ratio = window.devicePixelRatio || 1;
			const height = readHeight();
			const colors = readCanvasColors();

			canvas.width = width * ratio;
			canvas.height = height * ratio;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			staticCanvas.width = width * ratio;
			staticCanvas.height = height * ratio;

			staticContext.setTransform(ratio, 0, 0, ratio, 0, 0);
			staticContext.clearRect(0, 0, width, height);
			staticContext.fillStyle = colors.surface;
			staticContext.fillRect(0, 0, width, height);

			staticContext.strokeStyle = colors.grid;
			staticContext.lineWidth = 1;
			staticContext.beginPath();
			staticContext.moveTo(0, height / 2);
			staticContext.lineTo(width, height / 2);
			staticContext.stroke();

			const peaks = waveform.peaks;
			const step = width / Math.max(peaks.length, 1);
			const middle = height / 2;
			staticContext.strokeStyle = isSelected ? colors.selected : colors.base;
			staticContext.lineWidth = Math.max(1, step * 0.68);

			for (let index = 0; index < peaks.length; index += 1) {
				const peak = peaks[index] ?? 0;
				const x = index * step;
				const y = Math.max(2, peak * (height * 0.42));

				staticContext.beginPath();
				staticContext.moveTo(x, middle - y);
				staticContext.lineTo(x, middle + y);
				staticContext.stroke();
			}

			layout = {
				colors,
				height,
				ratio,
				width,
			};
			redrawProgress(currentTimeRef.current);
			return true;
		};

		const scheduleWaveformRedraw = () => {
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}

			frameId = window.requestAnimationFrame(() => {
				if (!redrawWaveform()) {
					frameId = window.requestAnimationFrame(() => {
						redrawWaveform();
					});
				}
			});
		};

		const observer = new ResizeObserver(scheduleWaveformRedraw);
		observer.observe(surface);

		// Canvas colors are sampled from CSS custom properties, so toggling the
		// `light`/`dark` class on <html> must trigger a redraw of the cached layer.
		let themeObserver: MutationObserver | null = null;
		if (typeof MutationObserver !== "undefined") {
			themeObserver = new MutationObserver(scheduleWaveformRedraw);
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"],
			});
		}

		scheduleWaveformRedraw();

		return () => {
			redrawProgressRef.current = () => undefined;
			colorProbe.remove();
			observer.disconnect();
			themeObserver?.disconnect();
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}
		};
	}, [canvasRef, isSelected, surfaceRef, waveform.durationMs, waveform.peaks]);
}
