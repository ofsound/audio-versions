import { useLayoutEffect } from "react";

export function useCloseOnEscape(enabled: boolean, onClose: () => void) {
	useLayoutEffect(() => {
		if (!enabled) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== "Escape" ||
				event.defaultPrevented ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}

			event.preventDefault();
			onClose();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [enabled, onClose]);
}
