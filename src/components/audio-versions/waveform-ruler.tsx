import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
	Ref,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildWaveformRulerTicks } from "#/lib/audio-versions/waveform-ruler";

interface WaveformRulerProps {
	durationMs: number;
	surfaceRef?: Ref<HTMLDivElement | null>;
	onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function WaveformRuler({
	durationMs,
	surfaceRef,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onPointerCancel,
	onDoubleClick,
}: WaveformRulerProps) {
	const localRef = useRef<HTMLDivElement | null>(null);
	const [widthPx, setWidthPx] = useState(0);

	function setSurfaceNode(node: HTMLDivElement | null) {
		localRef.current = node;
		if (typeof surfaceRef === "function") {
			surfaceRef(node);
		} else if (surfaceRef) {
			surfaceRef.current = node;
		}
	}

	useEffect(() => {
		const surface = localRef.current;
		if (!surface) {
			return;
		}

		const updateWidth = () => {
			const nextWidth = Math.round(surface.clientWidth);
			setWidthPx((currentWidth) =>
				currentWidth === nextWidth ? currentWidth : nextWidth,
			);
		};
		updateWidth();

		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(updateWidth);
		observer?.observe(surface);
		window.addEventListener("resize", updateWidth);

		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", updateWidth);
		};
	}, []);

	const ticks = useMemo(
		() =>
			buildWaveformRulerTicks({
				durationMs,
				widthPx,
			}),
		[durationMs, widthPx],
	);

	const seekable = Boolean(onPointerDown);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ruler seeks by horizontal position, same as the canvas
		<div
			ref={setSurfaceNode}
			className={`waveform-ruler relative h-[var(--waveform-ruler-height)] w-full overflow-hidden bg-[var(--color-waveform-surface)]${
				seekable ? " cursor-pointer" : ""
			}`}
			data-testid="waveform-ruler"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
			onDoubleClick={onDoubleClick}
		>
			{ticks.map((tick) => {
				const leftPercent = (tick.timeMs / Math.max(durationMs, 1)) * 100;

				if (tick.kind === "minor") {
					return (
						<span
							key={`minor-${tick.timeMs}`}
							className="pointer-events-none absolute top-0 w-px bg-[color-mix(in_srgb,var(--color-text-muted)_55%,transparent)]"
							style={{
								left: `${leftPercent}%`,
								height: "35%",
							}}
						/>
					);
				}

				return (
					<span
						key={`major-${tick.timeMs}`}
						className="pointer-events-none absolute inset-y-0"
						style={{ left: `${leftPercent}%` }}
					>
						<span className="absolute inset-y-0 left-0 w-px bg-[color-mix(in_srgb,var(--color-text-muted)_72%,transparent)]" />
						{tick.label ? (
							<span
								className={`absolute top-0 text-[length:var(--waveform-ruler-font-size)] leading-[var(--waveform-ruler-height)] tabular-nums text-[var(--color-text-muted)] ${
									tick.timeMs === 0 ? "left-0.5" : "left-1"
								}`}
							>
								{tick.label}
							</span>
						) : null}
					</span>
				);
			})}
		</div>
	);
}
