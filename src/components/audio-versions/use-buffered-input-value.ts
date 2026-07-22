import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";

interface UseBufferedInputValueOptions {
	value: string;
	onCommit: (value: string) => Promise<void> | void;
	delayMs?: number;
}

export function useBufferedInputValue({
	value,
	onCommit,
	delayMs = 500,
}: UseBufferedInputValueOptions) {
	const [draft, setDraftState] = useState(value);
	const draftRef = useRef(value);
	const pendingValueRef = useRef<string | null>(null);

	useEffect(() => {
		draftRef.current = draft;
	}, [draft]);

	const commitValue = useCallback(
		async (nextValue: string) => {
			pendingValueRef.current = nextValue;
			try {
				await onCommit(nextValue);
			} catch (error) {
				if (pendingValueRef.current === nextValue) {
					pendingValueRef.current = null;
				}
				throw error;
			}
		},
		[onCommit],
	);

	const {
		cancel,
		flush: flushScheduled,
		schedule,
	} = useDebouncedAsyncCallback({
		callback: commitValue,
		delayMs,
	});

	useEffect(() => {
		if (pendingValueRef.current === value) {
			pendingValueRef.current = null;
		}

		if (pendingValueRef.current === null && draftRef.current !== value) {
			draftRef.current = value;
			setDraftState(value);
		}
	}, [value]);

	const setDraft = useCallback(
		(nextValue: string) => {
			draftRef.current = nextValue;
			setDraftState(nextValue);
			if (nextValue === value) {
				cancel();
				return;
			}

			schedule(nextValue);
		},
		[cancel, schedule, value],
	);

	const flush = useCallback(async () => {
		if (draftRef.current === value) {
			cancel();
			return;
		}

		await flushScheduled();
	}, [cancel, flushScheduled, value]);

	return {
		draft,
		flush,
		setDraft,
	};
}
