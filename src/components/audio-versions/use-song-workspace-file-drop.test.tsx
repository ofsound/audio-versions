// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSongWorkspaceFileDrop } from "./use-song-workspace-file-drop";

afterEach(cleanup);
function Harness({
	audio,
	images,
	error,
	enabled = true,
}: {
	audio: (file: File) => void;
	images: (scope: "song" | "file", files: File[]) => void;
	error: (message: string) => void;
	enabled?: boolean;
}) {
	const state = useSongWorkspaceFileDrop({
		enabled,
		onAudioFileDrop: audio,
		onImageFilesDrop: images,
		onDropError: error,
	});
	return (
		<div>
			<div data-testid="song" data-gallery-drop-target="song" />
			<div data-testid="file" data-gallery-drop-target="file" />
			<div data-testid="audio" data-gallery-drop-target="audio" />
			<output>{state.isFileDragActive ? state.dropTarget : "idle"}</output>
		</div>
	);
}
const png = new File(["png"], "settings.png", { type: "image/png" });
const wav = new File(["wav"], "mix.wav", { type: "audio/wav" });
const transfer = (files: File[]) => ({ types: ["Files"], files });
describe("workspace drop destinations", () => {
	it("routes images by column and audio to the player", () => {
		const audio = vi.fn(),
			images = vi.fn(),
			error = vi.fn();
		render(<Harness {...{ audio, images, error }} />);
		fireEvent.dragOver(screen.getByTestId("song"), {
			dataTransfer: transfer([png]),
		});
		expect(screen.getByText("song")).toBeTruthy();
		fireEvent.dragOver(screen.getByTestId("file"), {
			dataTransfer: transfer([png]),
		});
		expect(screen.getByText("file")).toBeTruthy();
		fireEvent.drop(screen.getByTestId("file"), {
			dataTransfer: transfer([png]),
		});
		expect(images).toHaveBeenLastCalledWith("file", [png]);
		fireEvent.drop(screen.getByTestId("song"), {
			dataTransfer: transfer([png, png]),
		});
		expect(images).toHaveBeenLastCalledWith("song", [png, png]);
		fireEvent.drop(screen.getByTestId("audio"), {
			dataTransfer: transfer([wav]),
		});
		expect(audio).toHaveBeenCalledWith(wav);
		expect(error).not.toHaveBeenCalled();
		expect(screen.getByText("idle")).toBeTruthy();
	});
	it("explains mismatched destinations and mixed files without importing", () => {
		const audio = vi.fn(),
			images = vi.fn(),
			error = vi.fn();
		render(<Harness {...{ audio, images, error }} />);
		fireEvent.drop(screen.getByTestId("audio"), {
			dataTransfer: transfer([png]),
		});
		expect(error).toHaveBeenLastCalledWith(
			expect.stringContaining("Song Notes"),
		);
		fireEvent.drop(screen.getByTestId("file"), {
			dataTransfer: transfer([wav]),
		});
		expect(error).toHaveBeenLastCalledWith(expect.stringContaining("player"));
		fireEvent.drop(screen.getByTestId("song"), {
			dataTransfer: transfer([png, wav]),
		});
		expect(error).toHaveBeenLastCalledWith("Drop audio and images separately.");
		expect(audio).not.toHaveBeenCalled();
		expect(images).not.toHaveBeenCalled();
	});
	it("blocks browser file navigation while a modal or upload disables drops", () => {
		const audio = vi.fn(),
			images = vi.fn(),
			error = vi.fn();
		render(<Harness {...{ audio, images, error }} enabled={false} />);
		expect(
			fireEvent.drop(screen.getByTestId("song"), {
				dataTransfer: transfer([png]),
			}),
		).toBe(false);
		expect(images).not.toHaveBeenCalled();
	});
});
