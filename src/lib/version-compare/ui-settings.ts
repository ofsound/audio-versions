import {
	normalizeUiSettings,
	type VersionCompareUiSettings,
	type WaveformHeightPreset,
} from "./types";

export const UI_SETTINGS_STORAGE_KEY = "version-compare-ui-settings";

const WAVEFORM_HEIGHT_PX_BY_PRESET: Record<WaveformHeightPreset, number> = {
	large: 164,
	medium: 128,
	small: 92,
};

export function getWaveformHeightPx(preset: WaveformHeightPreset): number {
	return WAVEFORM_HEIGHT_PX_BY_PRESET[preset];
}

function getUiSettingsRootVariables(uiSettings: VersionCompareUiSettings) {
	return {
		"--accent-light-primary-base": uiSettings.accentLightPrimary,
		"--accent-light-strong-base": uiSettings.accentLightStrong,
		"--accent-dark-primary-base": uiSettings.accentDarkPrimary,
		"--accent-dark-strong-base": uiSettings.accentDarkStrong,
		"--song-workspace-waveform-height": `${getWaveformHeightPx(
			uiSettings.waveformHeight,
		)}px`,
	};
}

export function applyUiSettingsToRoot(
	uiSettings: VersionCompareUiSettings,
	root: HTMLElement,
) {
	for (const [name, value] of Object.entries(
		getUiSettingsRootVariables(uiSettings),
	)) {
		root.style.setProperty(name, value);
	}
	if (uiSettings.keyboardFocusHighlights) {
		root.removeAttribute("data-reduce-keyboard-focus");
	} else {
		root.setAttribute("data-reduce-keyboard-focus", "");
	}
}

export function buildUiSettingsBootstrapScript({
	themeStorageKey,
	uiSettingsStorageKey,
}: {
	themeStorageKey: string;
	uiSettingsStorageKey: string;
}) {
	const waveformHeights = JSON.stringify(WAVEFORM_HEIGHT_PX_BY_PRESET);

	return `(() => {
	try {
		const storedTheme = window.localStorage.getItem("${themeStorageKey}");
		const resolvedTheme =
			storedTheme === "light" || storedTheme === "dark"
				? storedTheme
				: window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light";
		document.documentElement.classList.remove("light", "dark");
		document.documentElement.classList.add(resolvedTheme);

		const storedUiSettings = window.localStorage.getItem("${uiSettingsStorageKey}");
		if (!storedUiSettings) {
			return;
		}

		const uiSettings = JSON.parse(storedUiSettings);
		if (!uiSettings || typeof uiSettings !== "object") {
			return;
		}

		const root = document.documentElement;
		const applySetting = (name, value) => {
			if (typeof value === "string" && value.trim().length > 0) {
				root.style.setProperty(name, value);
			}
		};
		const waveformHeights = ${waveformHeights};
		applySetting("--accent-light-primary-base", uiSettings.accentLightPrimary);
		applySetting("--accent-light-strong-base", uiSettings.accentLightStrong);
		applySetting("--accent-dark-primary-base", uiSettings.accentDarkPrimary);
		applySetting("--accent-dark-strong-base", uiSettings.accentDarkStrong);
		const waveformHeight =
			typeof uiSettings.waveformHeight === "string"
				? waveformHeights[uiSettings.waveformHeight]
				: undefined;
		if (typeof waveformHeight === "number") {
			root.style.setProperty("--song-workspace-waveform-height", waveformHeight + "px");
		}

		if (uiSettings.keyboardFocusHighlights === false) {
			root.setAttribute("data-reduce-keyboard-focus", "");
		} else {
			root.removeAttribute("data-reduce-keyboard-focus");
		}
	} catch {}
})()`;
}

export function readUiSettingsFromStorage(
	windowObject: Window,
): VersionCompareUiSettings | null {
	const storedValue = windowObject.localStorage.getItem(
		UI_SETTINGS_STORAGE_KEY,
	);
	if (!storedValue) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(
			storedValue,
		) as Partial<VersionCompareUiSettings> | null;
		return normalizeUiSettings(parsedValue);
	} catch {
		return null;
	}
}

export function writeUiSettingsToStorage(
	windowObject: Window,
	uiSettings: VersionCompareUiSettings,
) {
	windowObject.localStorage.setItem(
		UI_SETTINGS_STORAGE_KEY,
		JSON.stringify(uiSettings),
	);
}
