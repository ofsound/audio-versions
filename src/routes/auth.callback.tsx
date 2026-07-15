import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
	component: AuthCallback,
});

function AuthCallback() {
	return (
		<div className="flex min-h-dvh items-center justify-center text-sm text-text-muted">
			Completing sign-in…
		</div>
	);
}
