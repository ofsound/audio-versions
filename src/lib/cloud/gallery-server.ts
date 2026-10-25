import { del, issueSignedToken, presignUrl } from "@vercel/blob";
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
