// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddToPlaylistMenu } from "./add-to-playlist-menu";

const {
	addAudioFileToPlaylistMock,
	createPlaylistMock,
	removeAudioFileFromPlaylistMock,
} = vi.hoisted(() => ({
	addAudioFileToPlaylistMock: vi.fn(),
	createPlaylistMock: vi.fn(),
	removeAudioFileFromPlaylistMock: vi.fn(),
}));

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		playlists: [
			{
				id: "playlist-1",
				name: "References",
				audioFileIds: [],
				sortOrder: 0,
				createdAt: "2026-08-02T00:00:00.000Z",
				updatedAt: "2026-08-02T00:00:00.000Z",
			},
		],
		addAudioFileToPlaylist: addAudioFileToPlaylistMock,
		createPlaylist: createPlaylistMock,
		removeAudioFileFromPlaylist: removeAudioFileFromPlaylistMock,
	}),
}));

describe("AddToPlaylistMenu", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("adds to an existing playlist and can create a populated playlist in place", async () => {
		addAudioFileToPlaylistMock.mockResolvedValue(undefined);
		createPlaylistMock.mockResolvedValue({ id: "playlist-2" });
		render(
			<AddToPlaylistMenu audioFileId="file-1" audioFileTitle="Final mix" />,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Add Final mix to playlist" }),
		);
		fireEvent.click(
			screen.getByRole("menuitemcheckbox", { name: /References/ }),
		);

		await waitFor(() => {
			expect(addAudioFileToPlaylistMock).toHaveBeenCalledWith(
				"playlist-1",
				"file-1",
			);
		});

		fireEvent.change(
			screen.getByRole("textbox", { name: "New playlist name" }),
			{
				target: { value: "Car references" },
			},
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Create playlist and add file" }),
		);

		await waitFor(() => {
			expect(createPlaylistMock).toHaveBeenCalledWith({
				name: "Car references",
				audioFileIds: ["file-1"],
			});
		});
	});
});
