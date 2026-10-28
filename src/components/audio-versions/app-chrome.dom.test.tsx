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
const setThemeMock = vi.fn();
let authUser: { email?: string } | null = { email: "listener@example.com" };
let cloudAvailable = true;
let songRouteId: string | null = null;

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useMatchRoute:
		() =>
		({ to }: { to: string }) =>
			to === "/songs/$songId" && songRouteId ? { songId: songRouteId } : false,
	useNavigate: () => navigateMock,
	useLocation: ({
		select,
	}: {
		select: (location: { pathname: string }) => string;
	}) => select({ pathname: songRouteId ? `/songs/${songRouteId}` : "/" }),
}));

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready: true,
		audioFiles: [],
		songs: [],
		blobsByAudioId: {},
		getSongById: () => (songRouteId ? { title: "Dev Day" } : undefined),
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
		audioFiles: [],
		songs: [],
		blobsByAudioId: {},
		signOut: signOutMock,
		user: authUser,
	}),
}));

vi.mock("#/providers/theme-provider", () => ({
	useTheme: () => ({
		theme: "light",
		toggleTheme: toggleThemeMock,
		setTheme: setThemeMock,
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
		songRouteId = null;
	});

	afterEach(() => {
		cleanup();
	});

	it("saves the Song Notes First column preference from settings", () => {
		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
		const setting = screen.getByRole("group", { name: "Song Notes First" });
		fireEvent.click(within(setting).getByRole("button", { name: "On" }));
		expect(updateUiSettingsMock).toHaveBeenLastCalledWith({
			songNotesFirst: true,
		});
		fireEvent.click(within(setting).getByRole("button", { name: "Off" }));
		expect(updateUiSettingsMock).toHaveBeenLastCalledWith({
			songNotesFirst: false,
		});
	});

	it("keeps the same library and playlist links on index and song routes", () => {
		const { rerender } = render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);
		const libraryButton = screen.getByRole("link", { name: "Songs" });
		const playlistsButton = screen.getByRole("link", { name: "Playlists" });
		const playlistsClasses = playlistsButton.className;
		const header = libraryButton.closest("header");
		const classes = libraryButton.className;
		expect(libraryButton.querySelector("svg")?.getAttribute("width")).toBe(
			"19",
		);
		expect(classes).toContain("h-12 w-12");
		songRouteId = "song-1";
		rerender(
			<AudioVersionsChrome>
				<main>Song</main>
			</AudioVersionsChrome>,
		);
		const songLibraryButton = screen.getByRole("link", {
			name: "Go to library",
		});
		expect(songLibraryButton).toBe(libraryButton);
		expect(songLibraryButton.className).toBe(classes);
		expect(songLibraryButton.closest("header")).toBe(header);
		const songPlaylistsButton = screen.getByRole("link", { name: "Playlists" });
		expect(songPlaylistsButton).toBe(playlistsButton);
		expect(songPlaylistsButton.className).toBe(playlistsClasses);
		expect(songPlaylistsButton.getAttribute("href")).toBe("/playlists");
		expect(
			songPlaylistsButton.querySelector("svg")?.getAttribute("width"),
		).toBe("19");
		expect(songPlaylistsButton.previousElementSibling).toBe(songLibraryButton);
		expect(header?.querySelector(".audio-versions-header-center")).toBeTruthy();
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
		expect(screen.queryByRole("group", { name: /color theme/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();

		fireEvent.click(settingsButton);

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
		expect(screen.getByRole("link", { name: /open trash/i })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Dark" }));
		expect(setThemeMock).toHaveBeenCalledWith("dark");

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

		expect(screen.getByRole("group", { name: /color theme/i })).toBeTruthy();
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

	it("opens settings with the platform settings shortcut", () => {
		render(
			<AudioVersionsChrome>
				<main>Library</main>
			</AudioVersionsChrome>,
		);

		fireEvent.keyDown(window, { key: ",", metaKey: true });

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();

		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.keyDown(window, { key: ",", ctrlKey: true });

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
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

		fireEvent.click(
			within(screen.getByRole("group", { name: "Focus Rings" })).getByRole(
				"button",
				{ name: "Show" },
			),
		);

		expect(updateUiSettingsMock).toHaveBeenCalledTimes(1);
		expect(updateUiSettingsMock).toHaveBeenCalledWith({
			keyboardFocusHighlights: true,
		});
	});
});
