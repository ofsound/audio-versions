// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createDefaultUiSettings } from "./types";
import {
	applyUiSettingsToRoot,
	getWaveformHeightPx,
	readUiSettingsFromStorage,
	UI_SETTINGS_STORAGE_KEY,
	writeUiSettingsToStorage,
} from "./ui-settings";

describe("ui settings helpers", () => {
	it("applies accent and waveform variables to the document root", () => {
		const uiSettings = {
			...createDefaultUiSettings(),
			accentLightPrimary: "#112233",
			accentDarkStrong: "#abcdef",
			waveformHeight: "small" as const,
			keyboardFocusHighlights: true,
		};

		applyUiSettingsToRoot(uiSettings, document.documentElement);

		expect(
			document.documentElement.style.getPropertyValue(
				"--accent-light-primary-base",
			),
		).toBe("#112233");
		expect(
			document.documentElement.style.getPropertyValue(
				"--accent-dark-strong-base",
			),
		).toBe("#abcdef");
		expect(
			document.documentElement.style.getPropertyValue(
				"--song-workspace-waveform-height",
			),
		).toBe("92px");
		expect(
			document.documentElement.hasAttribute("data-reduce-keyboard-focus"),
		).toBe(false);
	});

	it("sets data-reduce-keyboard-focus when keyboard highlights are disabled", () => {
		applyUiSettingsToRoot(
			{ ...createDefaultUiSettings(), keyboardFocusHighlights: false },
			document.documentElement,
		);

		expect(
			document.documentElement.hasAttribute("data-reduce-keyboard-focus"),
		).toBe(true);
	});

	it("removes data-reduce-keyboard-focus when keyboard highlights are re-enabled", () => {
		applyUiSettingsToRoot(
			{ ...createDefaultUiSettings(), keyboardFocusHighlights: false },
			document.documentElement,
		);
		applyUiSettingsToRoot(
			{ ...createDefaultUiSettings(), keyboardFocusHighlights: true },
			document.documentElement,
		);

		expect(
			document.documentElement.hasAttribute("data-reduce-keyboard-focus"),
		).toBe(false);
	});

	it("round-trips settings through local storage normalization", () => {
		const uiSettings = {
			...createDefaultUiSettings(),
			accentLightStrong: "#AABBCC",
		};

		writeUiSettingsToStorage(window, uiSettings);

		expect(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY)).toContain(
			"#AABBCC",
		);
		expect(readUiSettingsFromStorage(window)).toEqual({
			...uiSettings,
			accentLightStrong: "#aabbcc",
		});
	});

	it("maps waveform presets to pixel heights", () => {
		expect(getWaveformHeightPx("large")).toBe(164);
		expect(getWaveformHeightPx("medium")).toBe(128);
		expect(getWaveformHeightPx("small")).toBe(92);
	});
});
