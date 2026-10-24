// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBufferedInputValue } from "./use-buffered-input-value";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("keeps a newer color draft when the previous saved color echoes back", async () => {
	vi.useFakeTimers();
	const onCommit = vi.fn().mockResolvedValue(undefined);
	const { result, rerender } = renderHook(
		({ value }) => useBufferedInputValue({ value, onCommit, delayMs: 400 }),
		{ initialProps: { value: "#111111" } },
	);
	act(() => result.current.setDraft("#222222"));
	await act(async () => {
		await vi.advanceTimersByTimeAsync(400);
	});
	expect(onCommit).toHaveBeenCalledWith("#222222");
	act(() => result.current.setDraft("#333333"));
	rerender({ value: "#222222" });
	expect(result.current.draft).toBe("#333333");
	await act(async () => {
		await vi.advanceTimersByTimeAsync(400);
	});
	expect(onCommit).toHaveBeenLastCalledWith("#333333");
	rerender({ value: "#333333" });
	expect(result.current.draft).toBe("#333333");
});
