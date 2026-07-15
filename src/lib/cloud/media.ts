import { upload } from "@vercel/blob/client";

import type { AudioFileRecord } from "#/lib/song-mode/types";

import { getSupabaseBrowserClient } from "./supabase";

const signedUrlCache = new Map<string, { expiresAt: number; url: string }>();

function cloudApiUrl(pathname: string): string {
	const isElectron =
		typeof navigator !== "undefined" &&
		navigator.userAgent.includes("Electron");
	const configuredBaseUrl = import.meta.env.VITE_SONG_MODE_API_URL?.replace(
		/\/$/,
		"",
	);
	const baseUrl =
		configuredBaseUrl ?? (isElectron ? "https://song-mode.vercel.app" : "");
	return `${baseUrl}${pathname}`;
}

async function getAccessToken(): Promise<string> {
	const client = getSupabaseBrowserClient();
	if (!client) {
		throw new Error("Song Mode cloud media is not configured.");
	}

	const { data, error } = await client.auth.getSession();
	if (error || !data.session?.access_token) {
		throw new Error(error?.message ?? "Your Song Mode session has expired.");
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

export async function getRemoteAudioUrl(audioFileId: string): Promise<string> {
	const cached = signedUrlCache.get(audioFileId);
	if (cached && cached.expiresAt > Date.now() + 60_000) {
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
