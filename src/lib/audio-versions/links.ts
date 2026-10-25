import type { SongLinkTarget, SongRouteSearch } from "./types";

export function buildSongTargetPath(target: SongLinkTarget): string {
	const params = new URLSearchParams();
	if (target.noteTabId) params.set("noteTabId", target.noteTabId);

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

	let url: URL;
	try {
		url = new URL(raw, "https://audioversions.local");
	} catch {
		return null;
	}
	if (!url.pathname.startsWith("/songs/")) {
		return null;
	}

	let songId: string;
	try {
		songId = decodeURIComponent(url.pathname.replace("/songs/", ""));
	} catch {
		return null;
	}
	if (!songId) {
		return null;
	}

	const timeRaw = url.searchParams.get("timeMs");
	const timeMs =
		timeRaw && !Number.isNaN(Number(timeRaw)) ? Number(timeRaw) : undefined;

	return {
		songId,
		...(url.searchParams.get("noteTabId")
			? { noteTabId: url.searchParams.get("noteTabId") as string }
			: {}),
		fileId: url.searchParams.get("fileId") ?? undefined,
		annotationId: url.searchParams.get("annotationId") ?? undefined,
		timeMs,
		autoplay: url.searchParams.get("autoplay") === "1",
	};
}

export function targetToRouteSearch(target: SongLinkTarget): SongRouteSearch {
	return {
		...(target.noteTabId ? { noteTabId: target.noteTabId } : {}),
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
		...(typeof input.noteTabId === "string"
			? { noteTabId: input.noteTabId }
			: {}),
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
