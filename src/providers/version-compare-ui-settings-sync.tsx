import { useEffect } from "react";
import {
	applyUiSettingsToRoot,
	writeUiSettingsToStorage,
} from "#/lib/version-compare/ui-settings";
import { useVersionCompare } from "./version-compare-provider";

export function VersionCompareUiSettingsSync() {
	const { ready, settings } = useVersionCompare();

	useEffect(() => {
		if (!ready || typeof window === "undefined") {
			return;
		}

		applyUiSettingsToRoot(settings.ui, document.documentElement);
		writeUiSettingsToStorage(window, settings.ui);
	}, [ready, settings.ui]);

	return null;
}
