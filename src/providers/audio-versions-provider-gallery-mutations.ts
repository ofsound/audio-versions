import { useCallback, useMemo, useRef } from "react";
import {
	deleteGalleryBlob,
	saveAudioFile,
	saveGalleryBlob,
	saveSong,
} from "#/lib/audio-versions/db";
import { prepareGalleryImage } from "#/lib/audio-versions/gallery-images";
import type {
	AudioVersionsSnapshot,
	GalleryImage,
	GalleryScope,
} from "#/lib/audio-versions/types";
import {
	deleteRemoteGalleryPath,
	mutateRemoteGallery,
	uploadRemoteGalleryImage,
} from "#/lib/cloud/media";
import type { CloudPersistence } from "#/lib/cloud/persistence";
import type { CommitSnapshot } from "./audio-versions-provider-state";

function changeGallery(
	current: AudioVersionsSnapshot,
	scope: GalleryScope,
	change: (images: GalleryImage[]) => GalleryImage[],
): AudioVersionsSnapshot {
	const song = current.songs.find(
		(record) => record.id === scope.songId && !record.deletedAt,
	);
	const file = scope.audioFileId
		? current.audioFiles.find(
				(record) =>
					record.id === scope.audioFileId && record.songId === scope.songId,
			)
		: undefined;
	if (!song || (scope.audioFileId && !file))
		throw new Error("This gallery is no longer available.");
	const updatedAt = new Date().toISOString();
	if (file)
		return {
			...current,
			audioFiles: current.audioFiles.map((record) =>
				record.id === file.id
					? {
							...record,
							galleryImages: change(record.galleryImages ?? []),
							updatedAt,
						}
					: record,
			),
		};
	return {
		...current,
		songs: current.songs.map((record) =>
			record.id === song.id
				? {
						...record,
						galleryImages: change(record.galleryImages ?? []),
						updatedAt,
					}
				: record,
		),
	};
}

export function useGalleryMutations({
	cloud,
	cloudUserId,
	commitSnapshot,
}: {
	cloud: CloudPersistence | null;
	cloudUserId?: string;
	commitSnapshot: CommitSnapshot;
}) {
	const ownerRef = useRef(cloudUserId);
	ownerRef.current = cloudUserId;
	const persistParent = useCallback(
		async (snapshot: AudioVersionsSnapshot, scope: GalleryScope) => {
			if (scope.audioFileId) {
				const file = snapshot.audioFiles.find(
					(record) =>
						record.id === scope.audioFileId && record.songId === scope.songId,
				);
				if (file) await saveAudioFile(file);
			} else {
				const song = snapshot.songs.find(
					(record) => record.id === scope.songId,
				);
				if (song) await saveSong(song);
			}
		},
		[],
	);

	const addGalleryImages = useCallback(
		async (scope: GalleryScope, files: File[]) => {
			const added: GalleryImage[] = [];
			for (const file of files) {
				const prepared = await prepareGalleryImage(file);
				let image = prepared.image;
				let attached = false;
				let remoteImages: GalleryImage[] | undefined;
				try {
					if (ownerRef.current !== cloudUserId)
						throw new Error(
							"The signed-in account changed. Add these images again.",
						);
					if (cloudUserId)
						image = await uploadRemoteGalleryImage(
							cloudUserId,
							image,
							prepared.original,
							prepared.thumbnail,
						);
					if (ownerRef.current !== cloudUserId)
						throw new Error(
							"The signed-in account changed. Add these images again.",
						);
					if (cloud) {
						attached = true;
						remoteImages = await mutateRemoteGallery(scope, image);
					}
					await saveGalleryBlob(image.id, {
						original: prepared.original,
						thumbnail: prepared.thumbnail,
					});
					await commitSnapshot(
						(current) => {
							if (ownerRef.current !== cloudUserId)
								throw new Error(
									"The signed-in account changed. Add these images again.",
								);
							const next = changeGallery(
								current,
								scope,
								(images) => remoteImages ?? [...images, image],
							);
							attached = true;
							return next;
						},
						(next) => persistParent(next, scope),
					);
					added.push(image);
				} catch (error) {
					if (!attached) {
						// An upload that failed before persistence must not leave private orphan media.
						for (const media of [image.remoteMedia, image.thumbnailMedia]) {
							if (media)
								await deleteRemoteGalleryPath(media.pathname).catch(
									() => undefined,
								);
						}
						await deleteGalleryBlob(image.id).catch(() => undefined);
					}
					throw error;
				}
			}
			return added;
		},
		[cloud, cloudUserId, commitSnapshot, persistParent],
	);

	const removeGalleryImage = useCallback(
		async (scope: GalleryScope, imageId: string) => {
			const remoteImages = cloud
				? await mutateRemoteGallery(scope, imageId)
				: undefined;
			let removed: GalleryImage | undefined;
			await commitSnapshot(
				(current) =>
					changeGallery(current, scope, (images) => {
						removed = images.find((image) => image.id === imageId);
						return (
							remoteImages ?? images.filter((image) => image.id !== imageId)
						);
					}),
				async (next) => {
					for (const media of [removed?.remoteMedia, removed?.thumbnailMedia]) {
						if (media && !cloud) await deleteRemoteGalleryPath(media.pathname);
					}
					await persistParent(next, scope);
					await deleteGalleryBlob(imageId);
				},
			);
		},
		[cloud, commitSnapshot, persistParent],
	);
	return useMemo(
		() => ({ addGalleryImages, removeGalleryImage }),
		[addGalleryImages, removeGalleryImage],
	);
}
