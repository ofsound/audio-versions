// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useWorkspacePanelWidths } from "./use-workspace-panel-widths";

afterEach(() => {
	cleanup();
	localStorage.clear();
});
it("restores user panel widths after remounting", () => {
	const first = renderHook(useWorkspacePanelWidths);
	const widths = { left: 520, center: 340, right: 420 };
	act(() => first.result.current[1](widths));
	first.unmount();
	const second = renderHook(useWorkspacePanelWidths);
	expect(second.result.current[0]).toEqual(widths);
});
it("ignores invalid saved widths", () => {
	localStorage.setItem(
		"audio-versions-workspace-panel-widths",
		JSON.stringify({ left: -1, center: 400, right: 500 }),
	);
	expect(renderHook(useWorkspacePanelWidths).result.current[0]).toBeNull();
});
