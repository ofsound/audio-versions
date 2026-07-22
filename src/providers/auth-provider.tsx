import type { User } from "@supabase/supabase-js";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import {
	getSupabaseBrowserClient,
	isCloudConfigured,
} from "#/lib/cloud/supabase";

interface AuthContextValue {
	cloudAvailable: boolean;
	ready: boolean;
	user: User | null;
	signInWithEmail: (email: string, password: string) => Promise<void>;
	signUpWithEmail: (email: string, password: string) => Promise<string | null>;
	signInWithGoogle: () => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isElectronRenderer(): boolean {
	return (
		typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")
	);
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const cloudAvailable = isCloudConfigured();
	const [ready, setReady] = useState(!cloudAvailable);
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		const client = getSupabaseBrowserClient();
		if (!client) {
			return;
		}

		let active = true;
		const initialize = async () => {
			const callbackCode =
				typeof window === "undefined"
					? null
					: new URL(window.location.href).searchParams.get("code");

			if (callbackCode && window.location.pathname === "/auth/callback") {
				const { error } =
					await client.auth.exchangeCodeForSession(callbackCode);
				if (error) {
					throw error;
				}
				window.location.replace("/");
				return;
			}

			const { data, error } = await client.auth.getSession();
			if (error) {
				throw error;
			}

			if (active) {
				setUser(data.session?.user ?? null);
				setReady(true);
			}
		};

		void initialize().catch(() => {
			if (active) {
				setReady(true);
			}
		});

		const { data } = client.auth.onAuthStateChange((_event, session) => {
			if (active) {
				setUser(session?.user ?? null);
				setReady(true);
			}
		});

		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, []);

	const signInWithEmail = useCallback(
		async (email: string, password: string) => {
			const client = getSupabaseBrowserClient();
			if (!client) {
				throw new Error("Cloud authentication is not configured.");
			}

			const { error } = await client.auth.signInWithPassword({
				email,
				password,
			});
			if (error) {
				throw error;
			}
		},
		[],
	);

	const signUpWithEmail = useCallback(
		async (email: string, password: string) => {
			const client = getSupabaseBrowserClient();
			if (!client) {
				throw new Error("Cloud authentication is not configured.");
			}

			const { data, error } = await client.auth.signUp({ email, password });
			if (error) {
				throw error;
			}

			return data.session
				? null
				: "Check your email to confirm your Audio Versions account.";
		},
		[],
	);

	const signInWithGoogle = useCallback(async () => {
		const client = getSupabaseBrowserClient();
		if (!client) {
			throw new Error("Cloud authentication is not configured.");
		}

		const electron = isElectronRenderer();
		const redirectTo = electron
			? "audio-versions://auth/callback"
			: `${window.location.origin}/auth/callback`;
		const { data, error } = await client.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo,
				skipBrowserRedirect: electron,
			},
		});
		if (error) {
			throw error;
		}

		if (electron && data.url) {
			window.open(data.url, "_blank", "noopener,noreferrer");
		}
	}, []);

	const signOut = useCallback(async () => {
		const client = getSupabaseBrowserClient();
		if (!client) {
			return;
		}

		const { error } = await client.auth.signOut();
		if (error) {
			throw error;
		}
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			cloudAvailable,
			ready,
			user,
			signInWithEmail,
			signInWithGoogle,
			signOut,
			signUpWithEmail,
		}),
		[
			cloudAvailable,
			ready,
			signInWithEmail,
			signInWithGoogle,
			signOut,
			signUpWithEmail,
			user,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used inside AuthProvider.");
	}

	return context;
}

export function useOptionalAuth(): Pick<
	AuthContextValue,
	"cloudAvailable" | "ready" | "signOut" | "user"
> {
	const context = useContext(AuthContext);
	return (
		context ?? {
			cloudAvailable: false,
			ready: true,
			signOut: async () => undefined,
			user: null,
		}
	);
}
