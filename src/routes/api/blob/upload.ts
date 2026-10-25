import { createFileRoute } from "@tanstack/react-router";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";

import {
	GALLERY_IMAGE_TYPES,
	MAX_GALLERY_IMAGE_SIZE,
} from "#/lib/audio-versions/gallery-images";
import { cloudCorsHeaders, cloudCorsPreflight } from "#/lib/cloud/cors-server";
import { isOwnedGalleryPath } from "#/lib/cloud/gallery-path";
import { authenticateRequest } from "#/lib/cloud/supabase-server";

export const Route = createFileRoute("/api/blob/upload")({
	server: {
		handlers: {
			OPTIONS: async ({ request }) => cloudCorsPreflight(request),
			POST: async ({ request }) => {
				const { user } = await authenticateRequest(request);
				const body = (await request.json()) as HandleUploadBody;
				const result = await handleUpload({
					request,
					body,
					onBeforeGenerateToken: async (pathname) => {
						const allowedPrefix = `users/${user.id}/audio/`;
						const isGalleryImage = isOwnedGalleryPath(pathname, user.id);
						if (!pathname.startsWith(allowedPrefix) && !isGalleryImage) {
							throw new Error("The upload pathname is not owned by this user.");
						}

						return {
							allowedContentTypes: isGalleryImage
								? GALLERY_IMAGE_TYPES
								: ["audio/*", "application/octet-stream"],
							maximumSizeInBytes: isGalleryImage
								? MAX_GALLERY_IMAGE_SIZE
								: 5_000_000_000_000,
							addRandomSuffix: true,
						};
					},
				});

				return Response.json(result, { headers: cloudCorsHeaders(request) });
			},
		},
	},
});
