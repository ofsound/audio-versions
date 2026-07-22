import { type FormEvent, useState } from "react";

import { useAuth } from "#/providers/auth-provider";

export function AuthScreen() {
	const { signInWithEmail, signInWithGoogle, signUpWithEmail } = useAuth();
	const [creatingAccount, setCreatingAccount] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		setMessage(null);

		try {
			if (creatingAccount) {
				setMessage(await signUpWithEmail(email.trim(), password));
			} else {
				await signInWithEmail(email.trim(), password);
			}
		} catch (authError) {
			setError(
				authError instanceof Error
					? authError.message
					: "Version Compare could not sign you in.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleGoogleSignIn() {
		setSubmitting(true);
		setError(null);
		setMessage(null);
		try {
			await signInWithGoogle();
		} catch (authError) {
			setError(
				authError instanceof Error
					? authError.message
					: "Version Compare could not start Google sign-in.",
			);
			setSubmitting(false);
		}
	}

	return (
		<main className="flex min-h-dvh items-center justify-center px-4 py-10 text-text">
			<section className="panel-shell w-full max-w-md p-7 sm:p-9">
				<div className="relative z-10 flex flex-col gap-7">
					<div className="flex flex-col gap-2">
						<h1 className="font-display m-0 text-5xl leading-none">
							Version Compare
						</h1>
						<p className="m-0 text-sm leading-6 text-text-muted">
							Sign in to keep your private library in sync across the web and
							desktop app.
						</p>
					</div>

					<button
						type="button"
						disabled={submitting}
						onClick={handleGoogleSignIn}
						className="action-secondary min-h-12 px-4 text-sm font-semibold"
					>
						Continue with Google
					</button>

					<div className="flex items-center gap-3 text-xs text-text-muted">
						<div className="h-px flex-1 bg-border-plain" />
						<span>or use email</span>
						<div className="h-px flex-1 bg-border-plain" />
					</div>

					<form className="flex flex-col gap-4" onSubmit={handleEmailSubmit}>
						<label className="flex flex-col gap-2">
							<span className="field-label">Email</span>
							<input
								type="email"
								autoComplete="email"
								required
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								className="field-input"
							/>
						</label>
						<label className="flex flex-col gap-2">
							<span className="field-label">Password</span>
							<input
								type="password"
								autoComplete={
									creatingAccount ? "new-password" : "current-password"
								}
								minLength={8}
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								className="field-input"
							/>
						</label>

						{error ? (
							<p className="callout-danger m-0 px-3 py-2 text-sm">{error}</p>
						) : null}
						{message ? (
							<p className="surface-chip m-0 px-3 py-2 text-sm">{message}</p>
						) : null}

						<button
							type="submit"
							disabled={submitting}
							className="action-primary min-h-12 px-4 text-sm font-semibold"
						>
							{submitting
								? "Please wait…"
								: creatingAccount
									? "Create account"
									: "Sign in"}
						</button>
					</form>

					<button
						type="button"
						className="border-0 bg-transparent p-0 text-sm text-link"
						onClick={() => {
							setCreatingAccount((current) => !current);
							setError(null);
							setMessage(null);
						}}
					>
						{creatingAccount
							? "Already have an account? Sign in"
							: "New to Version Compare? Create an account"}
					</button>
				</div>
			</section>
		</main>
	);
}
