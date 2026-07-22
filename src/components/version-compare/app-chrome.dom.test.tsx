// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUiSettings } from "#/lib/version-compare/types";
import { VersionCompareChrome } from "./app-chrome";

const navigateMock = vi.fn();
const updateUiSettingsMock = vi.fn().mockResolvedValue(undefined);

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

vi.mock("#/providers/version-compare-provider", () => ({
	useVersionCompare: () => ({
		ready: true,
		getSongById: () => undefined,
		settings: {
			ui: createDefaultUiSettings(),
		},
		updateUiSettings: updateUiSettingsMock,
	}),
}));

vi.mock("./global-search", () => ({
	GlobalSearch: () => <div data-testid="global-search" />,
}));

vi.mock("./theme-toggle", () => ({
	ThemeToggle: () => (
		<button
			type="button"
			className="theme-toggle-button h-12 w-12 shrink-0"
			aria-label="Switch to dark mode"
		>
			theme
		</button>
	),
}));

describe("VersionCompareChrome", () => {
	beforeEach(() => {
		updateUiSettingsMock.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the settings button before the theme toggle and opens the modal", () => {
		render(
			<VersionCompareChrome>
				<main>Library</main>
			</VersionCompareChrome>,
		);

		const settingsButton = screen.getByRole("button", {
			name: /open settings/i,
		});
		const themeButton = screen.getByRole("button", {
			name: /switch to dark mode/i,
		});

		expect(settingsButton.className).toContain("theme-toggle-button");
		expect(themeButton.className).toContain("theme-toggle-button");
		expect(Array.from(settingsButton.parentElement?.children ?? [])).toEqual(
			expect.arrayContaining([settingsButton, themeButton]),
		);
		expect(settingsButton.nextElementSibling).toBe(themeButton);

		fireEvent.click(settingsButton);

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
	});

	it("closes the settings modal on Escape", () => {
		render(
			<VersionCompareChrome>
				<main>Library</main>
			</VersionCompareChrome>,
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
			<VersionCompareChrome>
				<main>Library</main>
			</VersionCompareChrome>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: /open settings/i,
			}),
		);

		const focusCard = screen.getByText("Show focus rings").closest(".border");
		expect(focusCard).toBeTruthy();
		fireEvent.click(within(focusCard as HTMLElement).getByRole("button"));

		expect(updateUiSettingsMock).toHaveBeenCalledTimes(1);
		const updater = updateUiSettingsMock.mock.calls[0]?.[0];
		expect(typeof updater).toBe("function");
		expect(updater(createDefaultUiSettings())).toEqual({
			...createDefaultUiSettings(),
			keyboardFocusHighlights: true,
		});
	});
});
