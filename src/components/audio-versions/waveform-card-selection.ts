export function shouldIgnoreWaveformCardSelection(
	target: EventTarget | null,
): boolean {
	if (!(target instanceof HTMLElement)) {
		return true;
	}

	return Boolean(
		target.closest(
			[
				"button",
				"a",
				"input",
				"select",
				"textarea",
				"summary",
				"[role='button']",
				"[role='link']",
				"[contenteditable='true']",
			].join(","),
		),
	);
}
