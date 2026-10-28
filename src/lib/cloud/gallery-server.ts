import { del, head, issueSignedToken, presignUrl } from "@vercel/blob";
import {
	GALLERY_IMAGE_TYPES,
	MAX_GALLERY_IMAGE_SIZE,
} from "#/lib/audio-versions/gallery-images";
import type { GalleryImage } from "#/lib/audio-versions/types";
import { cloudCorsHeaders } from "./cors-server";
import { isOwnedGalleryPath } from "./gallery-path";
import { authenticateRequest } from "./supabase-server";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function handleGalleryMediaRequest(
	request: Request,
): Promise<Response> {
	const { client, user } = await authenticateRequest(request);
	const headers = {
		...cloudCorsHeaders(request),
		"Cache-Control": "private, no-store",
	};
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON body.", { status: 400 });
	}
	if (!body || typeof body !== "object")
		return new Response("Invalid body.", { status: 400 });
	if (body.action === "delete") {
		// Also permits cleanup of an interrupted upload. Only this user's image
		// namespace is deletable; audio and every other account are excluded.
		if (!isOwnedGalleryPath(body.pathname, user.id))
			return new Response("Invalid image pathname.", { status: 403 });
		await del(body.pathname);
		return Response.json({ deleted: true }, { headers });
	}
	const { songId, audioFileId, imageId } = body;
	if (body.action === "delete-song") {
		if (typeof songId !== "string" || !UUID.test(songId))
			return new Response("Invalid song id.", { status: 400 });
		// Parent ownership is checked even in Trash. This also handles deletion
		// from clients that do not display galleries yet.
		const song = await client
			.from("songs")
			.select("*")
			.eq("id", songId)
			.eq("user_id", user.id)
			.maybeSingle();
		if (song.error)
			return new Response("Unable to authorize this song.", { status: 500 });
		if (!song.data) return new Response("Song not found.", { status: 404 });
		const files = await client
			.from("audio_files")
			.select("*")
			.eq("song_id", songId)
			.eq("user_id", user.id);
		if (files.error)
			return new Response("Unable to authorize song files.", { status: 500 });
		for (const parent of [song.data, ...(files.data ?? [])]) {
			for (const pathname of ownedGalleryPaths(parent.gallery_images, user.id))
				await del(pathname);
		}
		return Response.json({ deleted: true }, { headers });
	}
	if (
		body.action === "prepare-upload" ||
		body.action === "attach" ||
		body.action === "remove"
	) {
		return mutateGallery(body, client, user.id, headers);
	}
	if (
		body.action !== "url" ||
		typeof songId !== "string" ||
		!UUID.test(songId) ||
		typeof imageId !== "string" ||
		!UUID.test(imageId) ||
		(audioFileId !== undefined &&
			(typeof audioFileId !== "string" || !UUID.test(audioFileId)))
	) {
		return new Response("Invalid gallery image request.", { status: 400 });
	}
	const songResult = await client
		.from("songs")
		.select("gallery_images")
		.eq("id", songId)
		.eq("user_id", user.id)
		.is("deleted_at", null)
		.maybeSingle();
	if (songResult.error)
		return new Response("Unable to authorize this gallery.", { status: 500 });
	if (!songResult.data) return new Response("Song not found.", { status: 404 });
	let images: GalleryImage[] = songResult.data.gallery_images ?? [];
	if (audioFileId) {
		const result = await client
			.from("audio_files")
			.select("gallery_images")
			.eq("id", audioFileId)
			.eq("song_id", songId)
			.eq("user_id", user.id)
			.is("deleted_at", null)
			.maybeSingle();
		if (result.error)
			return new Response("Unable to authorize this file gallery.", {
				status: 500,
			});
		if (!result.data)
			return new Response("Audio file not found.", { status: 404 });
		images = result.data.gallery_images ?? [];
	}
	const image = Array.isArray(images)
		? images.find((entry) => entry?.id === imageId)
		: undefined;
	const media = body.thumbnail
		? (image?.thumbnailMedia ?? image?.remoteMedia)
		: image?.remoteMedia;
	if (
		!media ||
		!isOwnedGalleryPath(media.pathname, user.id) ||
		!media.pathname.startsWith(`users/${user.id}/images/${imageId}/`)
	) {
		return new Response("Image not found.", { status: 404 });
	}
	const expiresAt = Date.now() + 60 * 60 * 1000;
	const token = await issueSignedToken({
		pathname: media.pathname,
		operations: ["get"],
		validUntil: expiresAt,
	});
	const { presignedUrl } = await presignUrl(token, {
		access: "private",
		operation: "get",
		pathname: media.pathname,
		validUntil: expiresAt,
	});
	return Response.json({ url: presignedUrl, expiresAt }, { headers });
}

export function ownedGalleryPaths(images: unknown, userId: string): string[] {
	if (!Array.isArray(images)) return [];
	return images.flatMap((image) => {
		if (!image || typeof image !== "object") return [];
		return [image.remoteMedia?.pathname, image.thumbnailMedia?.pathname].filter(
			(path) => isOwnedGalleryPath(path, userId),
		);
	});
}

// Conditional, gallery-only writes preserve concurrent notes, metadata and images.
async function mutateGallery(
	body: Record<string, unknown>,
	client: Awaited<ReturnType<typeof authenticateRequest>>["client"],
	userId: string,
	headers: HeadersInit,
): Promise<Response> {
	const { songId, audioFileId, imageId } = body;
	if (
		typeof songId !== "string" ||
		!UUID.test(songId) ||
		typeof imageId !== "string" ||
		!UUID.test(imageId) ||
		(audioFileId !== undefined &&
			(typeof audioFileId !== "string" || !UUID.test(audioFileId)))
	)
		return new Response("Invalid gallery destination.", { status: 400 });
	const song = await client
		.from("songs")
		.select("id")
		.eq("id", songId)
		.eq("user_id", userId)
		.is("deleted_at", null)
		.maybeSingle();
	if (song.error)
		return new Response("Unable to authorize gallery.", { status: 500 });
	if (!song.data) return new Response("Song not found.", { status: 404 });
	const table = audioFileId ? "audio_files" : "songs";
	const parent = () => {
		let query = client
			.from(table)
			.select("gallery_images,updated_at")
			.eq("id", audioFileId ?? songId)
			.eq("user_id", userId)
			.is("deleted_at", null);
		if (audioFileId) query = query.eq("song_id", songId);
		return query.maybeSingle();
	};
	let incoming: GalleryImage | undefined;
	if (body.action === "attach") {
		incoming = body.image as GalleryImage;
		if (
			!incoming ||
			incoming.id !== imageId ||
			typeof incoming.name !== "string" ||
			incoming.name.length > 1024 ||
			!GALLERY_IMAGE_TYPES.includes(incoming.contentType) ||
			!Number.isFinite(incoming.size) ||
			incoming.size <= 0 ||
			incoming.size > MAX_GALLERY_IMAGE_SIZE ||
			!Number.isInteger(incoming.width) ||
			!Number.isInteger(incoming.height) ||
			incoming.width <= 0 ||
			incoming.height <= 0 ||
			incoming.width * incoming.height > 50_000_000 ||
			typeof incoming.createdAt !== "string" ||
			!Number.isFinite(Date.parse(incoming.createdAt))
		)
			return new Response("Invalid image metadata.", { status: 400 });
		for (const media of [incoming.remoteMedia, incoming.thumbnailMedia]) {
			if (
				!media ||
				!isOwnedGalleryPath(media.pathname, userId) ||
				!media.pathname.startsWith(`users/${userId}/images/${imageId}/`)
			)
				return new Response("Invalid image media.", { status: 403 });
			const blob = await head(media.pathname);
			if (
				!GALLERY_IMAGE_TYPES.includes(blob.contentType) ||
				blob.size > MAX_GALLERY_IMAGE_SIZE ||
				blob.size !== media.size ||
				blob.contentType !== media.contentType
			)
				return new Response("Invalid uploaded image.", { status: 400 });
		}
	}
	for (let attempt = 0; attempt < 5; attempt++) {
		const { data, error } = await parent();
		if (error) return new Response("Unable to read gallery.", { status: 500 });
		if (!data) return new Response("Gallery not found.", { status: 404 });
		if (body.action === "prepare-upload") {
			if (
				typeof body.contentType !== "string" ||
				!GALLERY_IMAGE_TYPES.includes(body.contentType)
			)
				return new Response("Unsupported image type.", { status: 400 });
			const pathname = `users/${userId}/images/${imageId}/${body.thumbnail ? "thumbnail" : "original"}-${crypto.randomUUID()}`;
			const validUntil = Date.now() + 15 * 60 * 1000;
			const options = {
				pathname,
				validUntil,
				allowedContentTypes: [body.contentType],
				maximumSizeInBytes: MAX_GALLERY_IMAGE_SIZE,
			};
			const token = await issueSignedToken({ ...options, operations: ["put"] });
			const { presignedUrl } = await presignUrl(token, {
				...options,
				access: "private",
				operation: "put",
				addRandomSuffix: false,
				allowOverwrite: false,
			});
			return Response.json({ url: presignedUrl, pathname }, { headers });
		}
		const images: GalleryImage[] = data.gallery_images ?? [];
		const removed = images.find((image) => image.id === imageId);
		const next = incoming
			? removed
				? images
				: [...images, incoming]
			: images.filter((image) => image.id !== imageId);
		let update = client
			.from(table)
			.update({
				gallery_images: next,
				updated_at: new Date(
					Math.max(Date.now(), Date.parse(data.updated_at) + 1),
				).toISOString(),
			})
			.eq("id", audioFileId ?? songId)
			.eq("user_id", userId)
			.eq("updated_at", data.updated_at)
			.is("deleted_at", null);
		if (audioFileId) update = update.eq("song_id", songId);
		const result = await update.select("id");
		if (result.error)
			return new Response("Unable to save gallery.", { status: 500 });
		if (result.data?.length) {
			if (!incoming && removed) {
				// Metadata is detached before media cleanup; failures cannot resurrect it.
				await Promise.all(
					ownedGalleryPaths([removed], userId).map((path) =>
						del(path).catch(() => undefined),
					),
				);
			}
			return Response.json({ images: next }, { headers });
		}
	}
	return new Response("The gallery changed. Please retry.", { status: 409 });
}
