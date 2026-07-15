import { useEffect, useState } from "react";

import { getRemoteAudioUrl } from "#/lib/cloud/media";
import type { AudioFileRecord } from "#/lib/song-mode/types";

import { useObjectUrl } from "./use-object-url";

export function useAudioSource(
	audioFileId: string,
	blob: Blob | undefined,
	remoteMedia: AudioFileRecord["remoteMedia"],
): string | null {
	const localObjectUrl = useObjectUrl(blob);
	const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

	useEffect(() => {
		if (localObjectUrl || !remoteMedia) {
			setRemoteUrl(null);
			return;
		}

		let cancelled = false;
		void getRemoteAudioUrl(audioFileId)
			.then((url) => {
				if (!cancelled) {
					setRemoteUrl(url);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setRemoteUrl(null);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [audioFileId, localObjectUrl, remoteMedia]);

	return localObjectUrl ?? remoteUrl;
}
