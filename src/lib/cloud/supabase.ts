import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
	return Boolean(
		import.meta.env.VITE_SUPABASE_URL &&
			import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
	);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
	if (!isCloudConfigured()) {
		return null;
	}

	browserClient ??= createClient(
		import.meta.env.VITE_SUPABASE_URL,
		import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
		{
			auth: {
				autoRefreshToken: true,
				detectSessionInUrl: false,
				flowType: "pkce",
				persistSession: true,
			},
		},
	);

	return browserClient;
}
