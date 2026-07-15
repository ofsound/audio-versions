import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { uploadRemoteAudioBlob } from "#/lib/cloud/media";
import {
	loadCloudSnapshot,
	subscribeToCloudChanges,
	uploadCloudSnapshot,
} from "#/lib/cloud/persistence";
import {
	getLocalOwnerId,
	loadSnapshot,
	replaceLocalSnapshot,
	saveAudioFile,
} from "#/lib/song-mode/db";
import type { SongModeSnapshot } from "#/lib/song-mode/types";
import {
	EMPTY_SNAPSHOT,
	normalizeLoadedSnapshot,
} from "./song-mode-provider-hydration";

export type SnapshotUpdater = (current: SongModeSnapshot) => SongModeSnapshot;

export type SnapshotPersist = (next: SongModeSnapshot) => Promise<void>;

/**
 * Optimistically applies a snapshot update in React state, then serializes the
 * matching persistence work behind the provider queue. Persistence failures are
 * surfaced through the provider error state and by rejecting the returned
 * promise.
 */
export type CommitSnapshot = (
	updater: SnapshotUpdater,
	persist: SnapshotPersist,
) => Promise<SongModeSnapshot>;

function hasLibraryContent(snapshot: SongModeSnapshot): boolean {
	return (
		snapshot.songs.length > 0 ||
		snapshot.audioFiles.length > 0 ||
		snapshot.annotations.length > 0
	);
}

function mergeEntityRecords<T extends { id: string; updatedAt: string }>(
	localRecords: T[],
	cloudRecords: T[],
): T[] {
	const merged = new Map(cloudRecords.map((record) => [record.id, record]));
	for (const localRecord of localRecords) {
		const cloudRecord = merged.get(localRecord.id);
		if (!cloudRecord || localRecord.updatedAt > cloudRecord.updatedAt) {
			merged.set(localRecord.id, localRecord);
		}
	}

	return [...merged.values()];
}

function mergeLegacySnapshot(
	local: SongModeSnapshot,
	cloud: SongModeSnapshot,
): SongModeSnapshot {
	const mergedAudioFiles = mergeEntityRecords(
		local.audioFiles,
		cloud.audioFiles,
	);
	const localById = new Map(
		local.audioFiles.map((record) => [record.id, record]),
	);
	const cloudById = new Map(
		cloud.audioFiles.map((record) => [record.id, record]),
	);

	return {
		songs: mergeEntityRecords(local.songs, cloud.songs),
		audioFiles: mergedAudioFiles.map((record) => ({
			...record,
			remoteMedia:
				record.remoteMedia ??
				localById.get(record.id)?.remoteMedia ??
				cloudById.get(record.id)?.remoteMedia,
		})),
		annotations: mergeEntityRecords(local.annotations, cloud.annotations),
		blobsByAudioId: local.blobsByAudioId,
		settings: cloud.settings,
	};
}

function extensionForBlob(blob: Blob): string {
	const subtype = blob.type.split("/")[1]?.split(";")[0]?.replace("x-", "");
	return subtype?.replace(/[^a-zA-Z0-9]/g, "") || "audio";
}

function needsMediaMigration(snapshot: SongModeSnapshot): boolean {
	return snapshot.audioFiles.some(
		(audioFile) =>
			!audioFile.remoteMedia &&
			snapshot.blobsByAudioId[audioFile.id] instanceof Blob,
	);
}

function hasNewerCachedEntities(
	cloud: SongModeSnapshot,
	merged: SongModeSnapshot,
): boolean {
	const hasNewer = <T extends { id: string; updatedAt: string }>(
		cloudRecords: T[],
		mergedRecords: T[],
	) => {
		const cloudById = new Map(
			cloudRecords.map((record) => [record.id, record]),
		);
		return mergedRecords.some((record) => {
			const cloudRecord = cloudById.get(record.id);
			return cloudRecord != null && record.updatedAt > cloudRecord.updatedAt;
		});
	};

	return (
		hasNewer(cloud.songs, merged.songs) ||
		hasNewer(cloud.audioFiles, merged.audioFiles) ||
		hasNewer(cloud.annotations, merged.annotations)
	);
}

async function migrateLocalAudio(
	userId: string,
	snapshot: SongModeSnapshot,
): Promise<SongModeSnapshot> {
	const audioFiles = await Promise.all(
		snapshot.audioFiles.map(async (audioFile) => {
			if (audioFile.remoteMedia) {
				return audioFile;
			}

			const blob = snapshot.blobsByAudioId[audioFile.id];
			if (!(blob instanceof Blob)) {
				return audioFile;
			}

			const originalName = `${audioFile.title}.${extensionForBlob(blob)}`;
			return {
				...audioFile,
				remoteMedia: await uploadRemoteAudioBlob(
					userId,
					audioFile.id,
					blob,
					originalName,
				),
			};
		}),
	);

	return { ...snapshot, audioFiles };
}

function attachCachedBlobs(
	cloud: SongModeSnapshot,
	local: SongModeSnapshot,
): SongModeSnapshot {
	const activeAudioIds = new Set(
		cloud.audioFiles.map((audioFile) => audioFile.id),
	);
	const localSongs = new Map(local.songs.map((record) => [record.id, record]));
	const localAudioFiles = new Map(
		local.audioFiles.map((record) => [record.id, record]),
	);
	const localAnnotations = new Map(
		local.annotations.map((record) => [record.id, record]),
	);
	const preferNewerLocal = <T extends { id: string; updatedAt: string }>(
		cloudRecord: T,
		localRecord: T | undefined,
	) =>
		localRecord && localRecord.updatedAt > cloudRecord.updatedAt
			? localRecord
			: cloudRecord;

	return {
		...cloud,
		songs: cloud.songs.map((record) =>
			preferNewerLocal(record, localSongs.get(record.id)),
		),
		audioFiles: cloud.audioFiles.map((record) =>
			preferNewerLocal(record, localAudioFiles.get(record.id)),
		),
		annotations: cloud.annotations.map((record) =>
			preferNewerLocal(record, localAnnotations.get(record.id)),
		),
		blobsByAudioId: Object.fromEntries(
			Object.entries(local.blobsByAudioId).filter(([audioFileId]) =>
				activeAudioIds.has(audioFileId),
			),
		),
	};
}

export function useSongModeSnapshotState(cloudUserId?: string) {
	const [snapshot, setSnapshot] = useState<SongModeSnapshot>(EMPTY_SNAPSHOT);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const snapshotRef = useRef(snapshot);
	const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		snapshotRef.current = snapshot;
	}, [snapshot]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		loadSnapshot()
			.then(async (loadedSnapshot) => {
				if (cancelled) {
					return;
				}

				const { audioFilesToPersist, normalizedSnapshot: normalizedLocal } =
					await normalizeLoadedSnapshot(loadedSnapshot);

				if (audioFilesToPersist.length > 0) {
					await Promise.all(
						audioFilesToPersist.map((audioFile) => saveAudioFile(audioFile)),
					);
				}

				let normalizedSnapshot = normalizedLocal;
				if (cloudUserId) {
					const [ownerId, cloudResult] = await Promise.all([
						getLocalOwnerId(),
						loadCloudSnapshot(cloudUserId),
					]);

					if (ownerId == null && hasLibraryContent(normalizedLocal)) {
						normalizedSnapshot = cloudResult.exists
							? mergeLegacySnapshot(normalizedLocal, cloudResult.snapshot)
							: normalizedLocal;
						normalizedSnapshot = await migrateLocalAudio(
							cloudUserId,
							normalizedSnapshot,
						);
						await uploadCloudSnapshot(cloudUserId, normalizedSnapshot);
					} else if (cloudResult.exists) {
						normalizedSnapshot = attachCachedBlobs(
							cloudResult.snapshot,
							ownerId === cloudUserId ? normalizedLocal : EMPTY_SNAPSHOT,
						);
						const shouldReconcileCache =
							ownerId === cloudUserId &&
							hasNewerCachedEntities(cloudResult.snapshot, normalizedSnapshot);
						const shouldMigrateMedia = needsMediaMigration(normalizedSnapshot);
						if (shouldMigrateMedia) {
							normalizedSnapshot = await migrateLocalAudio(
								cloudUserId,
								normalizedSnapshot,
							);
						}
						if (shouldReconcileCache || shouldMigrateMedia) {
							await uploadCloudSnapshot(cloudUserId, normalizedSnapshot);
						}
					} else if (ownerId === cloudUserId) {
						normalizedSnapshot = await migrateLocalAudio(
							cloudUserId,
							normalizedLocal,
						);
						await uploadCloudSnapshot(cloudUserId, normalizedSnapshot);
					} else {
						normalizedSnapshot = cloudResult.snapshot;
					}

					await replaceLocalSnapshot(normalizedSnapshot, cloudUserId);
				}

				if (cancelled) {
					return;
				}

				snapshotRef.current = normalizedSnapshot;
				startTransition(() => {
					setSnapshot(normalizedSnapshot);
					setReady(true);
				});
			})
			.catch((loadError) => {
				if (cancelled) {
					return;
				}

				setError(
					loadError instanceof Error
						? loadError.message
						: "Song Mode could not load the local workspace.",
				);
				setReady(true);
			});

		return () => {
			cancelled = true;
		};
	}, [cloudUserId]);

	useEffect(() => {
		if (!cloudUserId || typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		let refreshTimer: ReturnType<typeof setTimeout> | undefined;
		const refreshFromCloud = () => {
			clearTimeout(refreshTimer);
			refreshTimer = setTimeout(() => {
				void loadCloudSnapshot(cloudUserId)
					.then(async ({ snapshot: cloudSnapshot }) => {
						if (cancelled) {
							return;
						}

						const next = attachCachedBlobs(cloudSnapshot, snapshotRef.current);
						await replaceLocalSnapshot(next, cloudUserId);
						if (cancelled) {
							return;
						}

						snapshotRef.current = next;
						startTransition(() => setSnapshot(next));
					})
					.catch((syncError) => {
						if (!cancelled) {
							setError(
								syncError instanceof Error
									? syncError.message
									: "Song Mode could not receive cloud changes.",
							);
						}
					});
			}, 80);
		};

		const unsubscribe = subscribeToCloudChanges(cloudUserId, refreshFromCloud);
		return () => {
			cancelled = true;
			clearTimeout(refreshTimer);
			unsubscribe();
		};
	}, [cloudUserId]);

	const commitSnapshot = useCallback<CommitSnapshot>(
		async (updater, persist) => {
			const current = snapshotRef.current;
			const next = updater(current);
			snapshotRef.current = next;
			setSnapshot(next);

			// Serialize persistence so optimistic UI updates cannot race IndexedDB writes.
			const persistTask = persistQueueRef.current
				.catch(() => undefined)
				.then(async () => {
					await persist(next);
				});

			persistQueueRef.current = persistTask.then(
				() => undefined,
				() => undefined,
			);

			try {
				await persistTask;
				return next;
			} catch (persistError) {
				setError(
					persistError instanceof Error
						? persistError.message
						: "Song Mode could not save the latest changes.",
				);
				throw persistError;
			}
		},
		[],
	);

	return {
		commitSnapshot,
		error,
		ready,
		setError,
		snapshot,
		snapshotRef,
	};
}
