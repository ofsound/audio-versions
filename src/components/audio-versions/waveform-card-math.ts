interface HorizontalBounds {
	left: number;
	width: number;
}

interface TooltipBounds {
	height: number;
	width: number;
}

function clampWaveformTime(currentTimeMs: number, durationMs: number) {
	return Math.max(0, Math.min(currentTimeMs, durationMs));
}

export function getPlayheadClientX(
	bounds: HorizontalBounds,
	currentTimeMs: number,
	durationMs: number,
) {
	if (bounds.width <= 0) {
		return null;
	}

	const ratio =
		clampWaveformTime(currentTimeMs, durationMs) / Math.max(durationMs, 1);
	return bounds.left + ratio * bounds.width;
}

export function getTimePerPixel(bounds: HorizontalBounds, durationMs: number) {
	if (bounds.width <= 0) {
		return 0;
	}

	return durationMs / bounds.width;
}

export function getWaveformTimeMs(
	bounds: HorizontalBounds,
	clientX: number,
	durationMs: number,
) {
	if (bounds.width <= 0) {
		return null;
	}

	const ratio = Math.min(
		1,
		Math.max(0, (clientX - bounds.left) / bounds.width),
	);
	return Math.round(durationMs * ratio);
}

export function getHoveredTooltipPosition(
	hoverX: number,
	hoverY: number,
	bounds: TooltipBounds,
) {
	if (bounds.width <= 0 || bounds.height <= 0) {
		return null;
	}

	const anchorX = Math.max(10, Math.min(bounds.width - 10, hoverX));
	const anchorY = Math.max(10, Math.min(bounds.height - 10, hoverY));
	const placeLeft = anchorX > bounds.width * 0.62;
	const placeBelow = anchorY < 82;

	return {
		left: `${anchorX + (placeLeft ? -14 : 14)}px`,
		top: `${anchorY + (placeBelow ? 14 : -14)}px`,
		transform: `${placeLeft ? "translateX(-100%)" : "translateX(0)"} ${placeBelow ? "translateY(0)" : "translateY(-100%)"}`,
	};
}
