// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AudioVersionsReadyBoundary } from "./audio-versions-ready-boundary";

let ready = false;
vi.mock("./audio-versions-provider", () => ({
	useAudioVersions: () => ({ ready }),
}));
afterEach(cleanup);
it("withholds settings-dependent forms, actions and empty states until hydration completes", () => {
	ready = false;
	const content = (
		<>
			<button type="button">Create song</button>
			<label>
				Artist
				<input />
			</label>
			<p>No playlists</p>
		</>
	);
	const view = render(
		<AudioVersionsReadyBoundary>{content}</AudioVersionsReadyBoundary>,
	);
	expect(screen.getByRole("status").textContent).toContain("Loading");
	expect(screen.queryByText("Artist")).toBeNull();
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByText("No playlists")).toBeNull();
	ready = true;
	view.rerender(
		<AudioVersionsReadyBoundary>{content}</AudioVersionsReadyBoundary>,
	);
	expect(screen.queryByRole("status")).toBeNull();
	expect(screen.getByRole("button", { name: "Create song" })).toBeTruthy();
	// A new account must load before exposing the preceding account's controls.
	ready = false;
	view.rerender(
		<AudioVersionsReadyBoundary>{content}</AudioVersionsReadyBoundary>,
	);
	expect(screen.queryByRole("button")).toBeNull();
});
