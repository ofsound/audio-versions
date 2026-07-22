import { useCallback, useEffect, useMemo, useRef } from "react";

interface UseDebouncedAsyncCallbackOptions<Args extends unknown[]> {
	callback: (...args: Args) => Promise<void> | void;
	delayMs: number;
}

export function useDebouncedAsyncCallback<Args extends unknown[]>({
	callback,
	delayMs,
}: UseDebouncedAsyncCallbackOptions<Args>) {
	const callbackRef = useRef(callback);
	const timerRef = useRef<number | null>(null);
	const latestArgsRef = useRef<Args | null>(null);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	const cancel = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const flush = useCallback(async () => {
		const args = latestArgsRef.current;
		if (!args) {
			cancel();
			return;
		}

		latestArgsRef.current = null;
		cancel();
		await callbackRef.current(...args);
	}, [cancel]);

	const schedule = useCallback(
		(...args: Args) => {
			latestArgsRef.current = args;
			cancel();
			timerRef.current = window.setTimeout(() => {
				void flush();
			}, delayMs);
		},
		[cancel, delayMs, flush],
	);

	useEffect(() => cancel, [cancel]);

	return useMemo(
		() => ({
			cancel,
			flush,
			schedule,
		}),
		[cancel, flush, schedule],
	);
}
