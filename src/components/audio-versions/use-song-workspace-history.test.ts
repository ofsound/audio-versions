// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSongWorkspaceHistory } from "./use-song-workspace-history";

describe("useSongWorkspaceHistory", () => {
	it("undoes and redoes the latest transaction", async () => {
		const undo = vi.fn(async () => {});
		const redo = vi.fn(async () => {});
		const { result } = renderHook(() => useSongWorkspaceHistory("song-1"));

		act(() => result.current.record({ undo, redo }));
		await act(() => result.current.undo());
		expect(undo).toHaveBeenCalledOnce();

		await act(() => result.current.redo());
		expect(redo).toHaveBeenCalledOnce();
	});

	it("groups adjacent edits with the same merge key", async () => {
		const firstUndo = vi.fn(async () => {});
		const latestUndo = vi.fn(async () => {});
		const latestRedo = vi.fn(async () => {});
		const { result } = renderHook(() => useSongWorkspaceHistory("song-1"));

		act(() => {
			result.current.record({
				mergeKey: "journal:song-1",
				undo: firstUndo,
				redo: async () => {},
			});
			result.current.record({
				mergeKey: "journal:song-1",
				undo: latestUndo,
				redo: latestRedo,
			});
		});

		await act(() => result.current.undo());
		expect(firstUndo).toHaveBeenCalledOnce();
		expect(latestUndo).not.toHaveBeenCalled();
		await act(() => result.current.redo());
		expect(latestRedo).toHaveBeenCalledOnce();
	});

	it("clears redo after a new forward edit and resets for another song", async () => {
		const redo = vi.fn(async () => {});
		const { result, rerender } = renderHook(
			({ songId }) => useSongWorkspaceHistory(songId),
			{ initialProps: { songId: "song-1" } },
		);

		act(() => result.current.record({ undo: async () => {}, redo }));
		await act(() => result.current.undo());
		act(() =>
			result.current.record({ undo: async () => {}, redo: async () => {} }),
		);
		await act(() => result.current.redo());
		expect(redo).not.toHaveBeenCalled();

		rerender({ songId: "song-2" });
		expect(await result.current.undo()).toBe(false);
	});
});
