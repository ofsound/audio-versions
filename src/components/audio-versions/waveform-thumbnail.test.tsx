// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import { WaveformThumbnail } from "./waveform-thumbnail";

vi.mock("./use-waveform-canvas", () => ({ useWaveformCanvas: vi.fn() }));
vi.mock("./add-to-playlist-menu", () => ({ AddToPlaylistMenu: () => null }));
afterEach(cleanup);
it("selects on a single click and opens and plays on a double click", () => {
	const audioFile: AudioFileRecord = {
		id: "file-1",
		songId: "song-1",
		title: "Mix",
		notes: EMPTY_RICH_TEXT,
		sessionDate: "2026-10-24",
		volumeDb: 0,
		durationMs: 10000,
		waveform: {
			peaks: [0.1],
			peakCount: 1,
			durationMs: 10000,
			sampleRate: 44100,
		},
		createdAt: "2026-10-24T00:00:00Z",
		updatedAt: "2026-10-24T00:00:00Z",
	};
	const onSelectFile = vi.fn();
	const onPlayFile = vi.fn();
	const onToggleStar = vi.fn();
	render(
		<WaveformThumbnail
			audioFile={audioFile}
			isStarred
			onToggleStar={onToggleStar}
			currentTimeMs={0}
			isSelected={false}
			deletingFile={false}
			onSelectFile={onSelectFile}
			onPlayFile={onPlayFile}
			onDeleteFile={vi.fn()}
		/>,
	);
	const star = screen.getByRole("button", { name: "Unstar Mix" });
	expect(star.getAttribute("aria-pressed")).toBe("true");
	fireEvent.click(star);
	expect(onToggleStar).toHaveBeenCalledOnce();
	expect(onSelectFile).not.toHaveBeenCalled();
	const thumbnail = screen.getByRole("button", { name: "Select Mix" });
	fireEvent.click(thumbnail);
	expect(onSelectFile).toHaveBeenCalledWith("file-1");
	expect(onPlayFile).not.toHaveBeenCalled();
	fireEvent.doubleClick(thumbnail);
	expect(onPlayFile).toHaveBeenCalledWith("file-1");
	onPlayFile.mockClear();
	fireEvent.doubleClick(screen.getByRole("button", { name: "Delete Mix" }));
	expect(onPlayFile).not.toHaveBeenCalled();
});
