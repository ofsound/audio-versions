import {
	type AudioVersionsUiSettings,
	normalizeUiSettings,
	type WaveformHeightPreset,
} from "./types";

export const UI_SETTINGS_STORAGE_KEY = "audio-versions-ui-settings";
const PREVIOUS_UI_SETTINGS_STORAGE_KEY = [
	"version",
	"compare",
	"ui",
	"settings",
].join("-");

const WAVEFORM_HEIGHT_PX_BY_PRESET: Record<WaveformHeightPreset, number> = {
	large: 164,
	medium: 128,
	small: 92,
};

export function getWaveformHeightPx(preset: WaveformHeightPreset): number {
	return WAVEFORM_HEIGHT_PX_BY_PRESET[preset];
}

function getUiSettingsRootVariables(uiSettings: AudioVersionsUiSettings) {
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
	uiSettings: AudioVersionsUiSettings,
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
	const previousUiSettingsStorageKey = JSON.stringify(
		PREVIOUS_UI_SETTINGS_STORAGE_KEY,
	);

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

		const currentUiSettings = window.localStorage.getItem("${uiSettingsStorageKey}");
		const previousUiSettingsKey = ${previousUiSettingsStorageKey};
		const storedUiSettings =
			currentUiSettings ?? window.localStorage.getItem(previousUiSettingsKey);
		if (!storedUiSettings) {
			return;
		}
		if (!currentUiSettings) {
			window.localStorage.setItem("${uiSettingsStorageKey}", storedUiSettings);
			window.localStorage.removeItem(previousUiSettingsKey);
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
): AudioVersionsUiSettings | null {
	const currentValue = windowObject.localStorage.getItem(
		UI_SETTINGS_STORAGE_KEY,
	);
	const storedValue =
		currentValue ??
		windowObject.localStorage.getItem(PREVIOUS_UI_SETTINGS_STORAGE_KEY);
	if (!storedValue) {
		return null;
	}
	if (!currentValue) {
		windowObject.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, storedValue);
		windowObject.localStorage.removeItem(PREVIOUS_UI_SETTINGS_STORAGE_KEY);
	}

	try {
		const parsedValue = JSON.parse(
			storedValue,
		) as Partial<AudioVersionsUiSettings> | null;
		return normalizeUiSettings(parsedValue);
	} catch {
		return null;
	}
}

export function writeUiSettingsToStorage(
	windowObject: Window,
	uiSettings: AudioVersionsUiSettings,
) {
	windowObject.localStorage.setItem(
		UI_SETTINGS_STORAGE_KEY,
		JSON.stringify(uiSettings),
	);
	windowObject.localStorage.removeItem(PREVIOUS_UI_SETTINGS_STORAGE_KEY);
}
