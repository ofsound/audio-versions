import { useEffect } from "react";
import {
	applyUiSettingsToRoot,
	writeUiSettingsToStorage,
} from "#/lib/audio-versions/ui-settings";
import { useAudioVersions } from "./audio-versions-provider";

export function AudioVersionsUiSettingsSync() {
	const { ready, settings } = useAudioVersions();

	useEffect(() => {
		if (!ready || typeof window === "undefined") {
			return;
		}

		applyUiSettingsToRoot(settings.ui, document.documentElement);
		writeUiSettingsToStorage(window, settings.ui);
	}, [ready, settings.ui]);

	return null;
}
