import { type MutableRefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR = [
	'a[href]:not([tabindex="-1"])',
	'button:not([disabled]):not([tabindex="-1"])',
	'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
	'select:not([disabled]):not([tabindex="-1"])',
	'textarea:not([disabled]):not([tabindex="-1"])',
	'[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter(
		(element) =>
			!element.hasAttribute("disabled") &&
			element.getAttribute("aria-hidden") !== "true",
	);
}

interface UseModalFocusTrapOptions {
	containerRef: MutableRefObject<HTMLElement | null>;
	initialFocusRef?: MutableRefObject<HTMLElement | null>;
}

export function useModalFocusTrap({
	containerRef,
	initialFocusRef,
}: UseModalFocusTrapOptions) {
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const previousActiveElement =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;

		const focusInitialElement = () => {
			const explicitInitial = initialFocusRef?.current;
			if (explicitInitial) {
				explicitInitial.focus();
				return;
			}

			const [firstFocusable] = getFocusableElements(container);
			(firstFocusable ?? container).focus();
		};

		const frameId = window.requestAnimationFrame(focusInitialElement);
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Tab") {
				return;
			}

			const focusableElements = getFocusableElements(container);
			if (focusableElements.length === 0) {
				event.preventDefault();
				container.focus();
				return;
			}

			const firstFocusable = focusableElements[0];
			const lastFocusable = focusableElements.at(-1);
			if (!firstFocusable || !lastFocusable) {
				return;
			}

			const activeElement =
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;

			if (event.shiftKey) {
				if (!activeElement || activeElement === firstFocusable) {
					event.preventDefault();
					lastFocusable.focus();
				}
				return;
			}

			if (!activeElement || activeElement === lastFocusable) {
				event.preventDefault();
				firstFocusable.focus();
			}
		};

		container.addEventListener("keydown", handleKeyDown);

		return () => {
			window.cancelAnimationFrame(frameId);
			container.removeEventListener("keydown", handleKeyDown);
			previousActiveElement?.focus();
		};
	}, [containerRef, initialFocusRef]);
}
