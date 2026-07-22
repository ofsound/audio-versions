import type { SongLinkTarget, SongRouteSearch } from "./types";

export function buildSongTargetPath(target: SongLinkTarget): string {
	const params = new URLSearchParams();

	if (target.fileId) {
		params.set("fileId", target.fileId);
	}

	if (target.annotationId) {
		params.set("annotationId", target.annotationId);
	}

	if (typeof target.timeMs === "number" && Number.isFinite(target.timeMs)) {
		params.set("timeMs", String(Math.max(0, Math.round(target.timeMs))));
	}

	if (target.autoplay) {
		params.set("autoplay", "1");
	}

	const query = params.toString();
	return `/songs/${encodeURIComponent(target.songId)}${query ? `?${query}` : ""}`;
}

export function parseSongTarget(raw?: string | null): SongLinkTarget | null {
	if (!raw) {
		return null;
	}

	const url = new URL(raw, "https://versioncompare.local");
	if (!url.pathname.startsWith("/songs/")) {
		return null;
	}

	const songId = decodeURIComponent(url.pathname.replace("/songs/", ""));
	if (!songId) {
		return null;
	}

	const timeRaw = url.searchParams.get("timeMs");
	const timeMs =
		timeRaw && !Number.isNaN(Number(timeRaw)) ? Number(timeRaw) : undefined;

	return {
		songId,
		fileId: url.searchParams.get("fileId") ?? undefined,
		annotationId: url.searchParams.get("annotationId") ?? undefined,
		timeMs,
		autoplay: url.searchParams.get("autoplay") === "1",
	};
}

export function targetToRouteSearch(target: SongLinkTarget): SongRouteSearch {
	return {
		fileId: target.fileId,
		annotationId: target.annotationId,
		timeMs: target.timeMs,
		autoplay: target.autoplay,
	};
}

export function normalizeSongRouteSearch(
	input: Record<string, unknown>,
): SongRouteSearch {
	const timeRaw = input.timeMs;
	const parsedTime =
		typeof timeRaw === "string"
			? Number(timeRaw)
			: typeof timeRaw === "number"
				? timeRaw
				: undefined;

	return {
		fileId: typeof input.fileId === "string" ? input.fileId : undefined,
		annotationId:
			typeof input.annotationId === "string" ? input.annotationId : undefined,
		timeMs:
			typeof parsedTime === "number" && Number.isFinite(parsedTime)
				? parsedTime
				: undefined,
		autoplay:
			input.autoplay === true ||
			input.autoplay === "1" ||
			input.autoplay === "true",
	};
}
