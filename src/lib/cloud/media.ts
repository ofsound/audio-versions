import { upload } from "@vercel/blob/client";

import type {
	AudioFileRecord,
	GalleryImage,
	GalleryScope,
} from "#/lib/audio-versions/types";

import { getSupabaseBrowserClient } from "./supabase";

const signedUrlCache = new Map<string, { expiresAt: number; url: string }>();

function cloudApiUrl(pathname: string): string {
	const isElectron =
		typeof navigator !== "undefined" &&
		navigator.userAgent.includes("Electron");
	const configuredBaseUrl =
		import.meta.env.VITE_AUDIO_VERSIONS_API_URL?.replace(/\/$/, "");
	const baseUrl =
		configuredBaseUrl ??
		(isElectron ? "https://audio-versions.vercel.app" : "");
	return `${baseUrl}${pathname}`;
}

async function getAccessToken(): Promise<string> {
	const client = getSupabaseBrowserClient();
	if (!client) {
		throw new Error("Audio Versions cloud media is not configured.");
	}

	const { data, error } = await client.auth.getSession();
	if (error || !data.session?.access_token) {
		throw new Error(
			error?.message ?? "Your Audio Versions session has expired.",
		);
	}

	return data.session.access_token;
}

function safeFilename(filename: string): string {
	const sanitized = filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
	return sanitized || "audio-file";
}

export async function uploadRemoteAudio(
	userId: string,
	audioFileId: string,
	file: File,
): Promise<NonNullable<AudioFileRecord["remoteMedia"]>> {
	return uploadRemoteAudioBlob(userId, audioFileId, file, file.name);
}

export async function uploadRemoteAudioBlob(
	userId: string,
	audioFileId: string,
	blobBody: Blob,
	originalName: string,
): Promise<NonNullable<AudioFileRecord["remoteMedia"]>> {
	const accessToken = await getAccessToken();
	const blob = await upload(
		`users/${userId}/audio/${audioFileId}/${safeFilename(originalName)}`,
		blobBody,
		{
			access: "private",
			contentType: blobBody.type || "application/octet-stream",
			handleUploadUrl: cloudApiUrl("/api/blob/upload"),
			headers: { Authorization: `Bearer ${accessToken}` },
			multipart: blobBody.size > 100_000_000,
		},
	);

	return {
		pathname: blob.pathname,
		contentType: blob.contentType,
		size: blobBody.size,
		originalName,
	};
}

export async function getRemoteAudioUrl(
	audioFileId: string,
	refresh = false,
): Promise<string> {
	const cached = signedUrlCache.get(audioFileId);
	if (!refresh && cached && cached.expiresAt > Date.now() + 60_000) {
		return cached.url;
	}

	const accessToken = await getAccessToken();
	const response = await fetch(cloudApiUrl("/api/blob/signed-url"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ audioFileId }),
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}

	const result = (await response.json()) as {
		expiresAt: number;
		url: string;
	};
	signedUrlCache.set(audioFileId, result);
	return result.url;
}

export async function deleteRemoteAudio(audioFileId: string): Promise<void> {
	const accessToken = await getAccessToken();
	const response = await fetch(cloudApiUrl("/api/blob/delete"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ audioFileId }),
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}

	signedUrlCache.delete(audioFileId);
}

export async function uploadRemoteGalleryImage(
	userId: string,
	image: GalleryImage,
	original: Blob,
	thumbnail: Blob,
): Promise<GalleryImage> {
	const accessToken = await getAccessToken();
	const send = async (body: Blob, name: string) => {
		const result = await upload(
			`users/${userId}/images/${image.id}/${safeFilename(name).replace(/^\.+/, "image-")}`,
			body,
			{
				access: "private",
				contentType: body.type,
				handleUploadUrl: cloudApiUrl("/api/blob/upload"),
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		return {
			pathname: result.pathname,
			contentType: result.contentType,
			size: body.size,
			originalName: name,
		};
	};
	const remoteMedia = await send(original, image.name);
	try {
		const thumbnailMedia = await send(thumbnail, "thumbnail.webp");
		return { ...image, remoteMedia, thumbnailMedia };
	} catch (error) {
		await deleteRemoteGalleryPath(remoteMedia.pathname).catch(() => undefined);
		throw error;
	}
}

async function galleryMediaRequest(body: object): Promise<Response> {
	const accessToken = await getAccessToken();
	const response = await fetch(cloudApiUrl("/api/blob/gallery"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(await response.text());
	return response;
}

export async function getRemoteGalleryUrl(
	scope: GalleryScope,
	imageId: string,
	thumbnail: boolean,
	refresh = false,
): Promise<string> {
	const key = `gallery:${imageId}:${thumbnail}`;
	const cached = signedUrlCache.get(key);
	if (!refresh && cached && cached.expiresAt > Date.now() + 60_000)
		return cached.url;
	const response = await galleryMediaRequest({
		action: "url",
		...scope,
		imageId,
		thumbnail,
	});
	const result = (await response.json()) as { expiresAt: number; url: string };
	signedUrlCache.set(key, result);
	return result.url;
}

export async function deleteRemoteGalleryPath(pathname: string): Promise<void> {
	await galleryMediaRequest({ action: "delete", pathname });
}

export async function deleteRemoteSongGallery(songId: string): Promise<void> {
	await galleryMediaRequest({ action: "delete-song", songId });
}

export async function mutateRemoteGallery(
	scope: import("#/lib/audio-versions/types").GalleryScope,
	image: GalleryImage | string,
): Promise<GalleryImage[]> {
	const response = await galleryMediaRequest({
		...scope,
		action: typeof image === "string" ? "remove" : "attach",
		imageId: typeof image === "string" ? image : image.id,
		...(typeof image === "string" ? {} : { image }),
	});
	return (await response.json()).images;
}
