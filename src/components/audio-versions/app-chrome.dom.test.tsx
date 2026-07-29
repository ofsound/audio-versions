// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUiSettings } from "#/lib/audio-versions/types";
import { AudioVersionsChrome } from "./app-chrome";

const navigateMock = vi.fn();
const updateUiSettingsMock = vi.fn().mockResolvedValue(undefined);
const signOutMock = vi.fn().mockResolvedValue(undefined);
const toggleThemeMock = vi.fn();
let authUser: { email?: string } | null = { email: "listener@example.com" };
let cloudAvailable = true;

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props}>{children}</a>
	),
	useMatchRoute: () => () => false,
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready: true,
		getSongById: () => undefined,
		settings: {
			ui: createDefaultUiSettings(),
		},
		updateUiSettings: updateUiSettingsMock,
	}),
}));

vi.mock("#/providers/auth-provider", () => ({
	useOptionalAuth: () => ({
		cloudAvailable,
		ready: true,
		signOut: signOutMock,
		user: authUser,
	}),
}));

vi.mock("#/providers/theme-provider", () => ({
	useTheme: () => ({
		theme: "light",
		toggleTheme: toggleThemeMock,
	}),
}));

vi.mock("./global-search", () => ({
	GlobalSearch: () => <div data-testid="global-search" />,
}));

vi.mock("./quick-song-switcher", () => ({
	QuickSongSwitcher: () => null,
}));

describe("AudioVersionsChrome", () => {
	beforeEach(() => {
		updateUiSettingsMock.mockClear();
		signOutMock.mockClear();
		toggleThemeMock.mockClear();
		authUser = { email: "listener@example.com" };
		cloudAvailable = true;
	});

	afterEach(() => {
		cleanup();
	});

	it("renders only the settings action in the header and reveals account actions in the modal", () => {
		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);

		const settingsButton = screen.getByRole("button", {
			name: /open settings/i,
		});
		expect(settingsButton.className).toContain("theme-toggle-button");
		expect(settingsButton.parentElement?.children).toHaveLength(1);
		expect(screen.queryByRole("switch", { name: /color theme/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();

		fireEvent.click(settingsButton);

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
		fireEvent.click(screen.getByRole("switch", { name: /color theme/i }));
		expect(toggleThemeMock).toHaveBeenCalledTimes(1);

		fireEvent.click(
			screen.getByRole("button", {
				name: /sign out listener@example.com/i,
			}),
		);
		expect(signOutMock).toHaveBeenCalledTimes(1);
	});

	it("does not show sign out in settings when cloud authentication is unavailable", () => {
		cloudAvailable = false;
		authUser = null;

		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: /open settings/i,
			}),
		);

		expect(screen.getByRole("switch", { name: /color theme/i })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
	});

	it("closes the settings modal on Escape", () => {
		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: /open settings/i,
			}),
		);
		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: /settings/i })).toBeNull();
	});

	it("updates keyboard focus highlights from the settings dialog", () => {
		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: /open settings/i,
			}),
		);

		const focusSetting =
			screen.getByText("Show focus rings").parentElement?.parentElement;
		expect(focusSetting).toBeTruthy();
		fireEvent.click(within(focusSetting as HTMLElement).getByRole("button"));

		expect(updateUiSettingsMock).toHaveBeenCalledTimes(1);
		const updater = updateUiSettingsMock.mock.calls[0]?.[0];
		expect(typeof updater).toBe("function");
		expect(updater(createDefaultUiSettings())).toEqual({
			...createDefaultUiSettings(),
			keyboardFocusHighlights: true,
		});
	});
});
