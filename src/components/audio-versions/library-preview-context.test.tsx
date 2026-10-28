// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AudioFileRecord } from "#/lib/audio-versions/types";
import {
	LibraryPreviewProvider,
	useLibraryPreview,
} from "./library-preview-context";
import { WaveformCardAudio } from "./waveform-card-audio";

let pathname = "/";
const file = {
	id: "file",
	songId: "song",
	volumeDb: 0,
	durationMs: 60000,
} as AudioFileRecord;
const provider = {
	audioFiles: [file],
	songs: [{ id: "song" }],
	blobsByAudioId: { file: new Blob(["audio"]) },
	registerAudioElement: vi.fn(),
	reportPlaybackState: vi.fn(),
	seekFile: vi.fn(),
};
vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => provider,
}));
vi.mock("@tanstack/react-router", () => ({
	useLocation: ({
		select,
	}: {
		select: (location: { pathname: string }) => string;
	}) => select({ pathname }),
}));
vi.mock("./use-waveform-audio-graph", () => ({
	useWaveformAudioGraph: vi.fn(),
}));
const registerWaveform = vi.fn();
let waveformElement: HTMLAudioElement | null;
function Workspace() {
	const preview = useLibraryPreview();
	const ref = useRef<HTMLAudioElement | null>(null);
	return (
		<>
			<WaveformCardAudio
				externalAudio={preview?.element}
				audioFileDurationMs={60000}
				audioRef={ref}
				currentTimeMs={0}
				objectUrl="blob:should-not-reload"
				onRegisterAudioElement={registerWaveform}
				onReportPlayback={vi.fn()}
			/>
			<button
				type="button"
				onClick={() => {
					waveformElement = ref.current;
				}}
			>
				Inspect transport
			</button>
		</>
	);
}
function Page() {
	const preview = useLibraryPreview();
	return pathname === "/" ? (
		<button type="button" onClick={() => preview?.setFileId("file")}>
			Preview
		</button>
	) : (
		<Workspace />
	);
}
beforeEach(() => {
	pathname = "/";
	vi.clearAllMocks();
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
	Object.defineProperty(HTMLMediaElement.prototype, "paused", {
		configurable: true,
		get: () => false,
	});
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: vi.fn(() => "blob:preview"),
			revokeObjectURL: vi.fn(),
		}),
	);
	provider.seekFile.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it("keeps the same playing element, source and position when entering its song", async () => {
	const view = render(
		<LibraryPreviewProvider>
			<Page />
		</LibraryPreviewProvider>,
	);
	fireEvent.click(screen.getByText("Preview"));
	await waitFor(() =>
		expect(provider.seekFile).toHaveBeenCalledWith("file", 0, true),
	);
	const original = view.container.querySelector("audio");
	if (!original) throw new Error("Missing preview transport");
	original.currentTime = 17.5;
	fireEvent.timeUpdate(original);
	pathname = "/songs/song";
	view.rerender(
		<LibraryPreviewProvider>
			<Page />
		</LibraryPreviewProvider>,
	);
	fireEvent.click(screen.getByText("Inspect transport"));
	expect(waveformElement).toBe(original);
	expect(view.container.querySelectorAll("audio")).toHaveLength(1);
	expect(original.src).toBe("blob:preview");
	expect(original.currentTime).toBe(17.5);
	expect(original.pause).not.toHaveBeenCalled();
	expect(provider.seekFile).toHaveBeenCalledTimes(1);
	expect(registerWaveform).not.toHaveBeenCalled();
	expect(URL.revokeObjectURL).not.toHaveBeenCalled();
	fireEvent.pause(original);
	expect(provider.reportPlaybackState).toHaveBeenLastCalledWith("file", {
		isPlaying: false,
		currentTimeMs: 17500,
	});
});
it("stops and releases a preview when navigating to a different song", async () => {
	const view = render(
		<LibraryPreviewProvider>
			<Page />
		</LibraryPreviewProvider>,
	);
	fireEvent.click(screen.getByText("Preview"));
	await waitFor(() => expect(provider.seekFile).toHaveBeenCalled());
	const original = view.container.querySelector("audio");
	if (!original) throw new Error("Missing preview transport");
	pathname = "/songs/different";
	view.rerender(
		<LibraryPreviewProvider>
			<div>Different song</div>
		</LibraryPreviewProvider>,
	);
	expect(view.container.querySelector("audio")).toBeNull();
	expect(original.pause).toHaveBeenCalled();
	expect(provider.registerAudioElement).toHaveBeenLastCalledWith("file", null);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});
