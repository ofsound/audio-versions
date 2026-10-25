import { useEffect, useState } from "react";
import { getGalleryBlob } from "#/lib/audio-versions/db";
import type { GalleryImage, GalleryScope } from "#/lib/audio-versions/types";
import { getRemoteGalleryUrl } from "#/lib/cloud/media";

export function useGalleryImage(
	image: GalleryImage,
	scope: GalleryScope,
	thumbnail: boolean,
) {
	const [result, setResult] = useState<{
		id: string;
		url: string | null;
		error: string | null;
	}>({ id: image.id, url: null, error: null });
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | undefined;
		setResult({ id: image.id, url: null, error: null });
		void (async () => {
			const cached = await getGalleryBlob(image.id);
			let url: string;
			if (cached) {
				objectUrl = URL.createObjectURL(
					thumbnail ? cached.thumbnail : cached.original,
				);
				url = objectUrl;
			} else if (image.remoteMedia) {
				url = await getRemoteGalleryUrl(
					{ songId: scope.songId, audioFileId: scope.audioFileId },
					image.id,
					thumbnail,
					attempt > 0,
				);
			} else {
				throw new Error("This image is not available on this device.");
			}
			if (!cancelled) setResult({ id: image.id, url, error: null });
			else if (objectUrl) URL.revokeObjectURL(objectUrl);
		})().catch((error) => {
			if (!cancelled)
				setResult({
					id: image.id,
					url: null,
					error:
						error instanceof Error ? error.message : "Image could not load.",
				});
		});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [
		image.id,
		image.remoteMedia,
		scope.songId,
		scope.audioFileId,
		thumbnail,
		attempt,
	]);
	return {
		url: result.id === image.id ? result.url : null,
		error: result.id === image.id ? result.error : null,
		retry: () => setAttempt((value) => value + 1),
		fail: () =>
			setResult({
				id: image.id,
				url: null,
				error: "Image could not load. Retry to refresh its private link.",
			}),
	};
}
