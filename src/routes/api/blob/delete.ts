import { createFileRoute } from "@tanstack/react-router";
import { del } from "@vercel/blob";

import { cloudCorsHeaders, cloudCorsPreflight } from "#/lib/cloud/cors-server";
import { authenticateRequest } from "#/lib/cloud/supabase-server";

export const Route = createFileRoute("/api/blob/delete")({
	server: {
		handlers: {
			OPTIONS: async ({ request }) => cloudCorsPreflight(request),
			POST: async ({ request }) => {
				const { client, user } = await authenticateRequest(request);
				const { audioFileId } = (await request.json()) as {
					audioFileId?: string;
				};
				if (!audioFileId) {
					return new Response("Missing audio file id.", { status: 400 });
				}

				const { data, error } = await client
					.from("audio_files")
					.select("blob_pathname")
					.eq("user_id", user.id)
					.eq("id", audioFileId)
					.is("deleted_at", null)
					.maybeSingle();
				if (error) {
					return new Response(error.message, { status: 500 });
				}
				const pathname = data?.blob_pathname;
				if (typeof pathname === "string" && pathname) {
					await del(pathname);
				}

				return Response.json(
					{ deleted: true },
					{ headers: cloudCorsHeaders(request) },
				);
			},
		},
	},
});
