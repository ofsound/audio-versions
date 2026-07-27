import { useCallback, useState } from "react";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/audio-versions/types";
import { clampTime } from "#/lib/audio-versions/waveform";

const DEFAULT_RANGE_ANNOTATION_DURATION_MS = 10_000;

interface UseWaveformCardAnnotationsOptions {
	audioFile: AudioFileRecord;
	currentTimeMs: number;
	onCreateAnnotation: (
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
}

export function useWaveformCardAnnotations({
	audioFile,
	currentTimeMs,
	onCreateAnnotation,
	onSelectAnnotation,
	onSelectFile,
}: UseWaveformCardAnnotationsOptions) {
	const [pendingRangeStartMs, setPendingRangeStartMs] = useState<number | null>(
		null,
	);

	const createPointAnnotationAtTime = useCallback(
		async (timeMs: number) => {
			onSelectFile(audioFile.id);

			const annotation = await onCreateAnnotation({
				type: "point",
				startMs: timeMs,
				detail: EMPTY_RICH_TEXT,
				color: "var(--color-marker-point)",
			});
			onSelectAnnotation(annotation.id);
		},
		[audioFile.id, onCreateAnnotation, onSelectAnnotation, onSelectFile],
	);

	const createRangeAnnotationFromBounds = useCallback(
		async (startMs: number, endMs: number) => {
			onSelectFile(audioFile.id);

			const annotation = await onCreateAnnotation({
				type: "range",
				startMs,
				endMs,
				detail: EMPTY_RICH_TEXT,
				color: "var(--color-marker-range)",
			});
			onSelectAnnotation(annotation.id);
		},
		[audioFile.id, onCreateAnnotation, onSelectAnnotation, onSelectFile],
	);

	const createRangeAnnotationAtTime = useCallback(
		async (timeMs: number) => {
			await createRangeAnnotationFromBounds(
				timeMs,
				Math.min(
					audioFile.durationMs,
					timeMs + DEFAULT_RANGE_ANNOTATION_DURATION_MS,
				),
			);
		},
		[audioFile.durationMs, createRangeAnnotationFromBounds],
	);

	const clampPlayheadTimeMs = useCallback(
		() => clampTime(currentTimeMs, audioFile.durationMs),
		[audioFile.durationMs, currentTimeMs],
	);

	const handleAddMarkerAtPlayhead = useCallback(async () => {
		await createPointAnnotationAtTime(clampPlayheadTimeMs());
	}, [clampPlayheadTimeMs, createPointAnnotationAtTime]);

	const handleStartRangeAtPlayhead = useCallback(() => {
		onSelectFile(audioFile.id);
		setPendingRangeStartMs(clampPlayheadTimeMs());
	}, [audioFile.id, clampPlayheadTimeMs, onSelectFile]);

	const handleEndRangeAtPlayhead = useCallback(async () => {
		if (pendingRangeStartMs === null) {
			return;
		}

		const startCandidate = pendingRangeStartMs;
		const endCandidate = clampPlayheadTimeMs();
		let startMs = Math.min(startCandidate, endCandidate);
		let endMs = Math.max(startCandidate, endCandidate);

		if (endMs - startMs < 1) {
			endMs = Math.min(
				audioFile.durationMs,
				startMs + DEFAULT_RANGE_ANNOTATION_DURATION_MS,
			);
			if (endMs <= startMs) {
				startMs = Math.max(0, endMs - DEFAULT_RANGE_ANNOTATION_DURATION_MS);
			}
		}

		setPendingRangeStartMs(null);
		await createRangeAnnotationFromBounds(startMs, endMs);
	}, [
		audioFile.durationMs,
		clampPlayheadTimeMs,
		createRangeAnnotationFromBounds,
		pendingRangeStartMs,
	]);

	const handleCancelPendingRange = useCallback(() => {
		setPendingRangeStartMs(null);
	}, []);

	return {
		createPointAnnotationAtTime,
		createRangeAnnotationAtTime,
		createRangeAnnotationFromBounds,
		handleAddMarkerAtPlayhead,
		handleCancelPendingRange,
		handleEndRangeAtPlayhead,
		handleStartRangeAtPlayhead,
		pendingRangeStartMs,
	};
}
