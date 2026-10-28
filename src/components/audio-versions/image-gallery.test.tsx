// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GalleryImage } from "#/lib/audio-versions/types";
import { type GalleryGroup, GalleryViewer } from "./image-gallery";

vi.mock("./use-gallery-image", () => ({
	useGalleryImage: () => ({
		url: "blob:preview",
		error: null,
		retry: vi.fn(),
		fail: vi.fn(),
	}),
}));
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
const image = (id: string): GalleryImage => ({
	id,
	name: `${id}.png`,
	contentType: "image/png",
	width: 1600,
	height: 1000,
	size: 100,
	createdAt: "2026-10-24",
});
const groups: GalleryGroup[] = [
	{
		label: "Song gallery",
		scope: { songId: "song" },
		images: [image("song-image")],
	},
	{
		label: "File gallery · Mix 1",
		scope: { songId: "song", audioFileId: "file" },
		images: [image("file-image")],
	},
];
function Explorer({ remove = vi.fn(), close = vi.fn() }) {
	const [id, setId] = useState("song-image");
	return (
		<GalleryViewer
			groups={groups}
			imageId={id}
			onSelect={setId}
			onClose={close}
			onRemove={remove}
			busy={false}
		/>
	);
}
describe("image explorer", () => {
	it("shows both levels and navigates by arrows, thumbnails, keyboard and Escape", () => {
		const close = vi.fn();
		render(<Explorer close={close} />);
		const dialog = screen.getByRole("dialog", { name: "Image Gallery" });
		expect(dialog.closest(".song-modal--contained")).toBeTruthy();
		expect(screen.queryByText(/1 of 2|1600 × 1000/)).toBeNull();
		expect(
			within(dialog).getByRole("region", { name: "Song gallery overview" }),
		).toBeTruthy();
		expect(
			within(dialog).getByRole("region", {
				name: "File gallery · Mix 1 overview",
			}),
		).toBeTruthy();
		expect(screen.getByRole("img", { name: "song-image.png" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Next image" }));
		expect(screen.getByRole("img", { name: "file-image.png" })).toBeTruthy();
		fireEvent.keyDown(
			screen.getByRole("button", { name: "Close image gallery" }),
			{
				key: "ArrowLeft",
			},
		);
		expect(screen.getByRole("img", { name: "song-image.png" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Show original size" }));
		expect(
			screen
				.getByRole("button", { name: "Fit image" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		fireEvent.click(
			screen.getByRole("button", { name: "View file-image.png" }),
		);
		expect(
			screen.getByRole("button", { name: "Show original size" }),
		).toBeTruthy();
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(close).toHaveBeenCalled();
	});
	it("requires confirmation and sends the correct parent when removing", async () => {
		const remove = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<Explorer remove={remove} />);
		fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
		expect(remove).not.toHaveBeenCalled();
		vi.mocked(window.confirm).mockReturnValue(true);
		fireEvent.click(
			screen.getByRole("button", { name: "View file-image.png" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
		expect(remove).toHaveBeenCalledWith(
			{ songId: "song", audioFileId: "file" },
			"file-image",
		);
		await screen.findByRole("button", { name: "Remove image" });
	});
});
