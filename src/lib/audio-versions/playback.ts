import type { Annotation } from "./types";

export function findCrossedAnnotation(
	annotations: Annotation[],
	previousTimeMs: number,
	nextTimeMs: number,
): Annotation | undefined {
	if (previousTimeMs === nextTimeMs) {
		return undefined;
	}

	if (previousTimeMs < nextTimeMs) {
		let crossed: Annotation | undefined;
		for (const annotation of annotations) {
			if (
				previousTimeMs < annotation.startMs &&
				annotation.startMs <= nextTimeMs
			) {
				crossed = annotation;
			}
		}
		return crossed;
	}

	for (const annotation of annotations) {
		if (
			nextTimeMs <= annotation.startMs &&
			annotation.startMs < previousTimeMs
		) {
			return annotation;
		}
	}

	return undefined;
}
