import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { getRemoteAudioUrl } from "#/lib/cloud/media";

import { useObjectUrl } from "./use-object-url";

export function useAudioSource(
	audioFileId: string,
	blob: Blob | undefined,
	remoteMedia: AudioFileRecord["remoteMedia"],
	audioRef: RefObject<HTMLAudioElement | null>,
): string | null {
	const localObjectUrl = useObjectUrl(blob);
	const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

	useEffect(() => {
		if (localObjectUrl || !remoteMedia) {
			// A completed background download must not interrupt a track already playing.
			if (audioRef.current?.paused !== false) setRemoteUrl(null);
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
	}, [audioFileId, localObjectUrl, remoteMedia, audioRef]);

	const source =
		audioRef.current?.paused === false && remoteUrl
			? remoteUrl
			: (localObjectUrl ?? remoteUrl);
	const currentTime = audioRef.current?.currentTime ?? 0;
	const previousSource = useRef<string | null>(null);
	useLayoutEffect(() => {
		if (
			source &&
			previousSource.current &&
			source !== previousSource.current &&
			audioRef.current
		) {
			audioRef.current.currentTime = currentTime;
		}
		previousSource.current = source;
	}, [source, audioRef, currentTime]);
	return source;
}
