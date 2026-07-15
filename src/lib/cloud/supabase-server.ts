import {
	createClient,
	type SupabaseClient,
	type User,
} from "@supabase/supabase-js";

function createAuthenticatedServerClient(accessToken: string): SupabaseClient {
	const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
	const publishableKey =
		process.env.SUPABASE_PUBLISHABLE_KEY ??
		process.env.SUPABASE_ANON_KEY ??
		process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

	if (!url || !publishableKey) {
		throw new Error(
			"Supabase server environment variables are not configured.",
		);
	}

	return createClient(url, publishableKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	});
}

function readBearerToken(request: Request): string | null {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) {
		return null;
	}

	return authorization.slice("Bearer ".length).trim() || null;
}

export async function authenticateRequest(
	request: Request,
): Promise<{ client: SupabaseClient; user: User }> {
	const accessToken = readBearerToken(request);
	if (!accessToken) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const client = createAuthenticatedServerClient(accessToken);
	const { data, error } = await client.auth.getUser(accessToken);
	if (error || !data.user) {
		throw new Response("Unauthorized", { status: 401 });
	}

	return { client, user: data.user };
}
