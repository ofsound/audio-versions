import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { formatDuration } from "#/lib/audio-versions/waveform";

const DRAG_STEP_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const SCRUB_STEP_MS = 1000;
const FINE_SCRUB_STEP_MS = 100;
const SECOND_MS = 1000;

interface MarkerTimeFieldProps {
	ariaLabel: string;
	valueMs: number;
	minMs: number;
	maxMs: number;
	onCommit: (value: number) => void;
}

export function MarkerTimeField({
	ariaLabel,
	valueMs,
	minMs,
	maxMs,
	onCommit,
}: MarkerTimeFieldProps) {
	const clampedValueMs = clampToRange(valueMs, minMs, maxMs);
	const formatted = formatMarkerTime(clampedValueMs);
	const [draft, setDraft] = useState(formatted);
	const [focused, setFocused] = useState(false);
	const dragStateRef = useRef<{
		pointerId: number;
		startY: number;
		lastY: number;
		carryPx: number;
		valueMs: number;
		scrubbing: boolean;
	} | null>(null);
	const scrubActiveRef = useRef(false);

	useEffect(() => {
		if (!focused || scrubActiveRef.current) {
			setDraft(formatted);
		}
	}, [focused, formatted]);

	function commit() {
		const parsed = parseMarkerTime(draft);
		if (parsed == null) {
			setDraft(formatted);
			return;
		}

		const clamped = snapToSecond(clampToRange(parsed, minMs, maxMs));
		if (clamped !== snapToSecond(clampedValueMs)) {
			onCommit(clamped);
			setDraft(formatMarkerTime(clamped));
		} else {
			setDraft(formatted);
		}
	}

	function endScrub(
		event: ReactPointerEvent<HTMLInputElement>,
		preserveFocus = true,
	) {
		const state = dragStateRef.current;
		if (!state || state.pointerId !== event.pointerId) {
			return;
		}

		if (state.scrubbing) {
			event.preventDefault();
		}

		scrubActiveRef.current = false;
		dragStateRef.current = null;
		document.body.style.removeProperty("user-select");
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (preserveFocus) {
			event.currentTarget.focus();
		}
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLInputElement>) {
		if (event.button !== 0) {
			return;
		}

		const parsedDraft = parseMarkerTime(draft);
		const nextValue =
			parsedDraft == null || draft === formatted
				? clampedValueMs
				: clampToRange(parsedDraft, minMs, maxMs);
		dragStateRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			lastY: event.clientY,
			carryPx: 0,
			valueMs: nextValue,
			scrubbing: false,
		};
		setDraft(formatMarkerTime(nextValue));
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLInputElement>) {
		const state = dragStateRef.current;
		if (!state || state.pointerId !== event.pointerId) {
			return;
		}

		const distanceFromStart = Math.abs(event.clientY - state.startY);
		if (!state.scrubbing) {
			if (distanceFromStart < DRAG_THRESHOLD_PX) {
				return;
			}

			state.scrubbing = true;
			scrubActiveRef.current = true;
			document.body.style.userSelect = "none";
		}

		event.preventDefault();

		const deltaY = state.lastY - event.clientY;
		state.lastY = event.clientY;
		state.carryPx += deltaY;

		const stepCount = Math.trunc(state.carryPx / DRAG_STEP_PX);
		if (stepCount === 0) {
			return;
		}

		state.carryPx -= stepCount * DRAG_STEP_PX;
		const stepMs = event.shiftKey ? FINE_SCRUB_STEP_MS : SCRUB_STEP_MS;
		const nextValue = clampToRange(
			state.valueMs + stepCount * stepMs,
			minMs,
			maxMs,
		);
		if (nextValue === state.valueMs) {
			return;
		}

		state.valueMs = nextValue;
		setDraft(formatMarkerTime(nextValue));
		onCommit(nextValue);
	}

	return (
		<input
			type="text"
			inputMode="numeric"
			aria-label={ariaLabel}
			value={draft}
			onFocus={() => setFocused(true)}
			onChange={(event) => setDraft(event.target.value)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={(event) => endScrub(event)}
			onPointerCancel={(event) => endScrub(event, false)}
			onBlur={() => {
				if (scrubActiveRef.current) {
					return;
				}
				setFocused(false);
				commit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					setFocused(false);
					commit();
					(event.target as HTMLInputElement).blur();
				} else if (event.key === "Escape") {
					event.preventDefault();
					setDraft(formatted);
					setFocused(false);
					(event.target as HTMLInputElement).blur();
				}
			}}
			className="field-input field-input--compact w-[2.625rem] flex-[0_0_2.625rem] text-center font-mono tabular-nums"
		/>
	);
}

function clampToRange(value: number, minMs: number, maxMs: number): number {
	const safeMin = Math.max(0, Math.round(minMs));
	const safeMax = Math.max(safeMin, Math.round(maxMs));
	return Math.max(safeMin, Math.min(safeMax, Math.round(value)));
}

function snapToSecond(valueMs: number): number {
	return Math.round(valueMs / SECOND_MS) * SECOND_MS;
}

function formatMarkerTime(valueMs: number): string {
	return formatDuration(valueMs);
}

function parseMarkerTime(input: string): number | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return null;
	}

	const colonMatch = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
	if (colonMatch) {
		const minutes = Number(colonMatch[1]);
		const seconds = Number(colonMatch[2]);
		const fraction = colonMatch[3]
			? Math.round(Number(`0.${colonMatch[3]}`) * 1000)
			: 0;
		return Math.max(0, minutes * 60_000 + seconds * 1_000 + fraction);
	}

	const plainSeconds = /^\d+(\.\d+)?$/.exec(trimmed);
	if (plainSeconds) {
		return Math.max(0, Math.round(Number(trimmed) * 1000));
	}

	return null;
}
