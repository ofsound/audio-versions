import {
	createRootRoute,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { VersionCompareChrome } from "#/components/version-compare/app-chrome";
import { AuthScreen } from "#/components/version-compare/auth-screen";
import { VersionCompareDevtools } from "#/components/version-compare/version-compare-devtools";
import { THEME_STORAGE_KEY } from "#/lib/theme";
import {
	buildUiSettingsBootstrapScript,
	UI_SETTINGS_STORAGE_KEY,
} from "#/lib/version-compare/ui-settings";
import { AuthProvider, useAuth } from "#/providers/auth-provider";
import { ThemeProvider } from "#/providers/theme-provider";
import { VersionCompareProvider } from "#/providers/version-compare-provider";
import { VersionCompareUiSettingsSync } from "#/providers/version-compare-ui-settings-sync";

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
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				name: "theme-color",
				content: "#090f0d",
			},
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
			{
				name: "apple-mobile-web-app-title",
				content: "Version Compare",
			},
			{
				title: "Version Compare",
			},
		],
		links: [
			{
				rel: "manifest",
				href: "/manifest.json",
			},
			{
				rel: "apple-touch-icon",
				href: "/logo192.png",
			},
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
				Loading Version Compare…
			</div>
		);
	}

	if (cloudAvailable && !user) {
		return <AuthScreen />;
	}

	return (
		<VersionCompareProvider>
			<VersionCompareUiSettingsSync />
			<VersionCompareChrome>{children}</VersionCompareChrome>
			<VersionCompareDevtools />
		</VersionCompareProvider>
	);
}
