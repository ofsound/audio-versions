import {
	createRootRoute,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { SongModeChrome } from "#/components/song-mode/app-chrome";
import { AuthScreen } from "#/components/song-mode/auth-screen";
import { SongModeDevtools } from "#/components/song-mode/song-mode-devtools";
import {
	buildUiSettingsBootstrapScript,
	UI_SETTINGS_STORAGE_KEY,
} from "#/lib/song-mode/ui-settings";
import { THEME_STORAGE_KEY } from "#/lib/theme";
import { AuthProvider, useAuth } from "#/providers/auth-provider";
import { SongModeProvider } from "#/providers/song-mode-provider";
import { SongModeUiSettingsSync } from "#/providers/song-mode-ui-settings-sync";
import { ThemeProvider } from "#/providers/theme-provider";

import appCss from "#/styles.css?url";

const themeBootstrapScript = buildUiSettingsBootstrapScript({
	themeStorageKey: THEME_STORAGE_KEY,
	uiSettingsStorageKey: UI_SETTINGS_STORAGE_KEY,
});

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Song Mode",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<ScriptOnce>{themeBootstrapScript}</ScriptOnce>
			</head>
			<body>
				<ThemeProvider>
					<AuthProvider>
						<AuthenticatedShell>{children}</AuthenticatedShell>
					</AuthProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
	const { cloudAvailable, ready, user } = useAuth();

	if (!ready) {
		return (
			<div className="flex min-h-dvh items-center justify-center text-sm text-text-muted">
				Loading Song Mode…
			</div>
		);
	}

	if (cloudAvailable && !user) {
		return <AuthScreen />;
	}

	return (
		<SongModeProvider>
			<SongModeUiSettingsSync />
			<SongModeChrome>{children}</SongModeChrome>
			<SongModeDevtools />
		</SongModeProvider>
	);
}
