import { createFileRoute } from "@tanstack/react-router";
import { issueSignedToken, presignUrl } from "@vercel/blob";

import { cloudCorsHeaders, cloudCorsPreflight } from "#/lib/cloud/cors-server";
import { authenticateRequest } from "#/lib/cloud/supabase-server";

export const Route = createFileRoute("/api/blob/signed-url")({
	server: {
		handlers: {
			OPTIONS: async ({ request }) => cloudCorsPreflight(request),
			POST: async ({ request }) => {
				const { client, user } = await authenticateRequest(request);
				let audioFileId: unknown;
				try {
					audioFileId = ((await request.json()) as { audioFileId?: unknown })
						.audioFileId;
				} catch {
					return new Response("Invalid JSON body.", { status: 400 });
				}
				if (
					typeof audioFileId !== "string" ||
					!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
						audioFileId,
					)
				) {
					return new Response("Invalid audio file id.", { status: 400 });
				}

				const { data, error } = await client
					.from("audio_files")
					.select("blob_pathname")
					.eq("user_id", user.id)
					.eq("id", audioFileId)
					.is("deleted_at", null)
					.maybeSingle();
				if (error) {
					return new Response("Unable to authorize the audio file.", {
						status: 500,
					});
				}
				const pathname = data?.blob_pathname;
				if (typeof pathname !== "string" || !pathname) {
					return new Response("Audio file not found.", { status: 404 });
				}

				const expiresAt = Date.now() + 60 * 60 * 1000;
				const signedToken = await issueSignedToken({
					pathname,
					operations: ["get"],
					validUntil: expiresAt,
				});
				const { presignedUrl } = await presignUrl(signedToken, {
					access: "private",
					operation: "get",
					pathname,
					validUntil: expiresAt,
				});

				return Response.json(
					{ expiresAt, url: presignedUrl },
					{
						headers: {
							...cloudCorsHeaders(request),
							"Cache-Control": "private, no-store",
						},
					},
				);
			},
		},
	},
});
