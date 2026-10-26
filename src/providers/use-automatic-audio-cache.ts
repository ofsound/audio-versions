import { useEffect, useRef } from "react";
import { saveAudioBlob } from "#/lib/audio-versions/db";
import type { AudioVersionsSnapshot } from "#/lib/audio-versions/types";
import { getRemoteAudioUrl } from "#/lib/cloud/media";
import type { CommitSnapshot } from "./audio-versions-provider-state";

export function useAutomaticAudioCache({
	cloudUserId,
	ready,
	audioFiles,
	snapshotRef,
	commitSnapshot,
}: {
	cloudUserId?: string;
	ready: boolean;
	audioFiles: AudioVersionsSnapshot["audioFiles"];
	snapshotRef: { current: AudioVersionsSnapshot };
	commitSnapshot: CommitSnapshot;
}) {
	const wakeRef = useRef<() => void>(() => {});
	useEffect(() => {
		if (!cloudUserId || !ready) return;
		const controller = new AbortController();
		let running = false;
		const warmCache = async () => {
			if (running || navigator.onLine === false) return;
			running = true;
			const attempted = new Set<string>();
			const worker = async () => {
				while (!controller.signal.aborted) {
					const current = snapshotRef.current;
					const activeSongs = new Set(
						current.songs
							.filter((song) => !song.deletedAt)
							.map((song) => song.id),
					);
					const file = [...current.audioFiles]
						.sort((left, right) =>
							right.createdAt.localeCompare(left.createdAt),
						)
						.find(
							(file) =>
								activeSongs.has(file.songId) &&
								file.remoteMedia &&
								!current.blobsByAudioId[file.id] &&
								!attempted.has(file.id),
						);
					if (!file) return;
					attempted.add(file.id);
					try {
						let url = await getRemoteAudioUrl(file.id);
						let response = await fetch(url, { signal: controller.signal });
						if (response.status === 401 || response.status === 403) {
							url = await getRemoteAudioUrl(file.id, true);
							response = await fetch(url, { signal: controller.signal });
						}
						if (!response.ok) continue;
						const blob = await response.blob();
						if (
							!blob.size ||
							(file.remoteMedia?.size && blob.size !== file.remoteMedia.size)
						)
							continue;
						if (controller.signal.aborted) return;
						await commitSnapshot(
							(latest) => {
								if (
									controller.signal.aborted ||
									latest.blobsByAudioId[file.id] ||
									!latest.audioFiles.some(
										(entry) =>
											entry.id === file.id &&
											entry.remoteMedia?.pathname ===
												file.remoteMedia?.pathname,
									)
								)
									return latest;
								return {
									...latest,
									blobsByAudioId: { ...latest.blobsByAudioId, [file.id]: blob },
								};
							},
							async (next) => {
								if (
									!controller.signal.aborted &&
									next.blobsByAudioId[file.id] === blob
								) {
									await saveAudioBlob(file.id, blob, {
										ownerId: cloudUserId,
										pathname: file.remoteMedia?.pathname ?? "",
									});
								}
							},
						);
					} catch (error) {
						if (
							controller.signal.aborted ||
							(error instanceof DOMException &&
								error.name === "QuotaExceededError")
						)
							return;
						// Keep existing downloads usable and retry unavailable files on the next pass.
					}
				}
			};
			try {
				await Promise.all([worker(), worker()]);
			} finally {
				running = false;
			}
		};
		const wake = () => {
			void warmCache();
		};
		wakeRef.current = wake;
		wake();
		const timer = window.setInterval(wake, 30_000);
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			controller.abort();
			wakeRef.current = () => {};
			window.clearInterval(timer);
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
		};
	}, [cloudUserId, ready, snapshotRef, commitSnapshot]);
	useEffect(() => {
		if (audioFiles.length) wakeRef.current();
	}, [audioFiles]);
}
