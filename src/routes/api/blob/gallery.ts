import { createFileRoute } from "@tanstack/react-router";
import { cloudCorsPreflight } from "#/lib/cloud/cors-server";
import { handleGalleryMediaRequest } from "#/lib/cloud/gallery-server";

export const Route = createFileRoute("/api/blob/gallery")({
	server: {
		handlers: {
			OPTIONS: async ({ request }) => cloudCorsPreflight(request),
			POST: async ({ request }) => handleGalleryMediaRequest(request),
		},
	},
});
