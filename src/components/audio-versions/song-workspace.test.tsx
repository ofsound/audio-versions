// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/audio-versions/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongRouteSearch,
	WorkspaceState,
} from "#/lib/audio-versions/types";
import { createDefaultUiSettings } from "#/lib/audio-versions/types";
import { HeaderSlotsContext } from "./app-chrome";
import { SongWorkspace } from "./song-workspace";

const navigateMock = vi.fn();
const updateWorkspaceStateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props}>{children}</a>
	),
	useNavigate: () => navigateMock,
}));

vi.mock("./inspector-pane", () => ({
	InspectorPane: ({ selectedFile }: { selectedFile?: AudioFileRecord }) => (
		<div data-testid="inspector-pane">
			<div data-testid="inspector-selected-file">
				{selectedFile?.id ?? "none"}
			</div>
		</div>
	),
}));

vi.mock("./rich-text-editor", () => ({
	RichTextEditor: ({ focusId }: { focusId?: string }) => (
		<div data-testid="rich-text-editor" data-audio-versions-editor={focusId} />
	),
}));

vi.mock("./waveform-card", () => ({
	WaveformCard: ({
		audioFile,
		isSelected,
		currentTimeMs,
		onDeleteFile,
		onUpdateFile,
		onStepVolume,
		onSelectFile,
	}: {
		audioFile: AudioFileRecord;
		isSelected: boolean;
		currentTimeMs: number;
		onDeleteFile: () => Promise<void> | void;
		onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
		onStepVolume: (deltaDb: number) => Promise<void>;
		onSelectFile: (fileId: string) => void;
	}) => (
		<div data-testid="waveform-card" data-file-id={audioFile.id}>
			<span>
				{audioFile.title}:{String(isSelected)}
			</span>
			<span>{currentTimeMs} ms</span>
			<span>{audioFile.volumeDb} dB</span>
			<button
				type="button"
				aria-label={`Select ${audioFile.id}`}
				onClick={() => onSelectFile(audioFile.id)}
			>
				Select file
			</button>
			<button
				type="button"
				aria-label={`Delete ${audioFile.title}`}
				onClick={() => void onDeleteFile()}
			>
				Delete file
			</button>
			<button
				type="button"
				aria-label={`Rename ${audioFile.title}`}
				onClick={() =>
					void onUpdateFile({
						title: `${audioFile.title} - Print`,
						sessionDate: "2026-04-18",
					})
				}
			>
				Rename file
			</button>
			<button
				type="button"
				onClick={() => void onStepVolume(-1)}
				disabled={audioFile.volumeDb <= -12}
			>
				-
			</button>
			<button
				type="button"
				onClick={() => void onStepVolume(1)}
				disabled={audioFile.volumeDb >= 12}
			>
				+
			</button>
		</div>
	),
}));

vi.mock("./waveform-thumbnail", () => ({
	WaveformThumbnail: ({
		audioFile,
		isSelected,
		onSelectFile,
	}: {
		audioFile: AudioFileRecord;
		isSelected: boolean;
		onSelectFile: (fileId: string) => void;
	}) => (
		<button
			type="button"
			data-testid="waveform-thumbnail"
			aria-label={`Select ${audioFile.id}`}
			onClick={() => onSelectFile(audioFile.id)}
		>
			{audioFile.title}:{String(isSelected)}
		</button>
	),
}));

const baseSong: Song = {
	id: "song-1",
	title: "Reload Test",
	artist: "Tester",
	project: "Album",
	generalNotes: "",
	audioFileOrder: [],
	createdAt: "2026-04-16T00:00:00.000Z",
	updatedAt: "2026-04-16T00:00:00.000Z",
};

let currentAudioFiles: AudioFileRecord[] = [];
let currentWorkspace: WorkspaceState = {
	playheadMsByFileId: {},
	inspectorRatio: 0.56,
	lastVisitedAt: null,
};
let currentBlobsByAudioId: Record<string, Blob> = {};
let currentPlayback = {
	activeFileId: undefined as string | undefined,
	isPlaying: false,
	currentTimeByFileId: {} as Record<string, number>,
};
let currentAnnotationsByFileId: Record<string, Annotation[]> = {};
let currentUiSettings = createDefaultUiSettings();
let phoneViewportMatches = false;

const getSongById = vi.fn((songId: string) =>
	songId === baseSong.id
		? {
				...baseSong,
				audioFileOrder: currentAudioFiles.map((audioFile) => audioFile.id),
			}
		: undefined,
);
const getSongAudioFiles = vi.fn((songId: string) =>
	songId === baseSong.id ? currentAudioFiles : [],
);
const getAnnotationsForFile = vi.fn((fileId: string) => {
	return currentAnnotationsByFileId[fileId] ?? [];
});
const getWorkspaceState = vi.fn(() => currentWorkspace);
const addAudioFile = vi.fn();
const createAnnotation = vi.fn();
const deleteAudioFile = vi.fn();
const deleteAnnotation = vi.fn();
const jumpBetweenAnnotations = vi.fn();
const registerAudioElement = vi.fn();
const rememberSongOpened = vi.fn().mockResolvedValue(undefined);
const reorderAudioFiles = vi.fn();
const reportPlaybackState = vi.fn();
const seekActiveBy = vi.fn();
const seekFile = vi.fn();
const togglePlayback = vi.fn();
const updateAnnotation = vi.fn();
const updateAudioFile = vi.fn();
const updateSong = vi.fn();
const updateUiSettings = vi.fn();

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: baseSong.id,
		title: "Mix v1",
		sessionDate: "2026-04-16",
		notes: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 180000,
		waveform: {
			peaks: [0.2, 0.6, 0.4],
			peakCount: 3,
			durationMs: 180000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function deleteFile(title: string) {
	fireEvent.click(
		screen.getByRole("button", {
			name: new RegExp(`^delete ${title}$`, "i"),
		}),
	);
}

vi.mock("#/providers/audio-versions-provider", () => ({
	useAudioVersions: () => ({
		ready: true,
		getSongById,
		getSongAudioFiles,
		getAnnotationsForFile,
		getWorkspaceState,
		settings: {
			ui: currentUiSettings,
		},
		blobsByAudioId: currentBlobsByAudioId,
		playback: currentPlayback,
		rememberSongOpened,
		updateSong,
		addAudioFile,
		updateAudioFile,
		deleteAudioFile,
		reorderAudioFiles,
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
		updateWorkspaceState: updateWorkspaceStateMock,
		updateUiSettings,
		registerAudioElement,
		reportPlaybackState,
		togglePlayback,
		seekFile,
		seekActiveBy,
		jumpBetweenAnnotations,
	}),
}));

describe("SongWorkspace", () => {
	beforeEach(() => {
		currentAudioFiles = [];
		currentAnnotationsByFileId = {};
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		currentBlobsByAudioId = {};
		currentPlayback = {
			activeFileId: undefined,
			isPlaying: false,
			currentTimeByFileId: {},
		};
		currentUiSettings = createDefaultUiSettings();
		phoneViewportMatches = false;
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				matches: phoneViewportMatches,
				media: "(max-width: 767px)",
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		);
		navigateMock.mockReset();
		updateWorkspaceStateMock.mockReset();
		updateWorkspaceStateMock.mockResolvedValue(undefined);
		getSongById.mockClear();
		getSongAudioFiles.mockClear();
		getAnnotationsForFile.mockClear();
		getWorkspaceState.mockClear();
		rememberSongOpened.mockClear();
		deleteAudioFile.mockReset();
		deleteAudioFile.mockResolvedValue(undefined);
		updateAudioFile.mockReset();
		updateSong.mockReset();
		updateUiSettings.mockReset();
		updateSong.mockResolvedValue(undefined);
		Element.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllTimers();
	});

	it("shows uploaded audio after hydration and selects the first file", async () => {
		const search: SongRouteSearch = {
			autoplay: false,
		};

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={search} />,
		);

		expect(
			screen.getByText(/Add audio to start reviewing waveforms/i),
		).toBeTruthy();
		expect(screen.queryByText(/waveform stack/i)).toBeNull();
		expect(
			screen.queryByText(/Shift\+↑ \/ Shift\+↓ jumps markers/i),
		).toBeNull();

		currentAudioFiles = [createAudioFile()];
		currentBlobsByAudioId = {
			"file-1": new Blob(["tone"], { type: "audio/wav" }),
		};

		rerender(<SongWorkspace songId={baseSong.id} search={search} />);

		await waitFor(() => {
			expect(screen.getByTestId("waveform-card").textContent).toContain(
				"Mix v1:true",
			);
		});
		expect(screen.queryByText(/waveform stack/i)).toBeNull();
		expect(
			screen.queryByText(/Shift\+↑ \/ Shift\+↓ jumps markers/i),
		).toBeNull();
	});

	it("remembers the song on route entry without re-running on plain rerenders", async () => {
		currentAudioFiles = [createAudioFile()];

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		await waitFor(() => {
			expect(rememberSongOpened).toHaveBeenCalledWith(baseSong.id);
		});

		rememberSongOpened.mockClear();
		rerender(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		await waitFor(() => {
			expect(screen.getByTestId("waveform-card").textContent).toContain(
				"Mix v1:true",
			);
		});
		expect(rememberSongOpened).not.toHaveBeenCalled();
	});

	it("shows every thumbnail and only the selected full player", () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
			createAudioFile({ id: "file-3", title: "Mix C" }),
		];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.getAllByTestId("waveform-thumbnail")).toHaveLength(3);
		expect(screen.getAllByTestId("waveform-card")).toHaveLength(1);
		expect(
			screen
				.getAllByTestId("waveform-thumbnail")
				.map((thumbnail) => thumbnail.textContent),
		).toEqual(["Mix C:true", "Mix B:false", "Mix A:false"]);
		expect(screen.getByTestId("waveform-card").textContent).toContain(
			"Mix C:true",
		);
		const player = screen.getByTestId("waveform-card");
		const firstThumbnail = screen.getAllByTestId("waveform-thumbnail")[0];
		expect(
			player.compareDocumentPosition(firstThumbnail) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("uses the single-player layout on phone viewports", async () => {
		phoneViewportMatches = true;
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		await waitFor(() => {
			expect(screen.getAllByTestId("waveform-thumbnail")).toHaveLength(2);
		});
		expect(screen.getAllByTestId("waveform-card")).toHaveLength(1);
		expect(screen.getByTestId("mobile-file-player").textContent).toContain(
			"Mix B:true",
		);
	});

	it("opens the bottom file without automatically scrolling to it", () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.getByTestId("waveform-card").textContent).toContain(
			"Mix B:true",
		);
		expect(
			screen.getByRole("button", { name: "Select file-1" }).textContent,
		).toContain("Mix A:false");
		expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		expect(updateWorkspaceStateMock).not.toHaveBeenCalled();
	});

	it("does not reset selection to a stale ?fileId= when picking another waveform", async () => {
		const search: SongRouteSearch = {
			fileId: "file-1",
			autoplay: false,
		};
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];
		currentBlobsByAudioId = {
			"file-1": new Blob(["a"]),
			"file-2": new Blob(["b"]),
		};

		updateWorkspaceStateMock.mockImplementation((_songId, patch) => {
			currentWorkspace =
				typeof patch === "function"
					? patch(currentWorkspace as WorkspaceState)
					: { ...currentWorkspace, ...patch };
			return Promise.resolve();
		});

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={search} />,
		);

		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		fireEvent.click(screen.getByRole("button", { name: "Select file-2" }));

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});
		const navigateArg = navigateMock.mock.calls.find(
			(call) =>
				call[0] &&
				typeof call[0] === "object" &&
				"search" in call[0] &&
				typeof (call[0] as { search?: unknown }).search === "function",
		)?.[0] as {
			replace?: boolean;
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		expect(navigateArg?.replace).toBe(true);
		const nextSearch = navigateArg.search(search);
		rerender(<SongWorkspace songId={baseSong.id} search={nextSearch} />);
		await waitFor(() => {
			expect(screen.getByTestId("waveform-card").textContent).toContain(
				"Mix B:true",
			);
			expect(
				screen.getByRole("button", { name: "Select file-1" }).textContent,
			).toContain("Mix A:false");
		});
		expect(nextSearch.fileId).toBe("file-2");
		expect(nextSearch.annotationId).toBeUndefined();
		expect(nextSearch.timeMs).toBeUndefined();
		expect(nextSearch.autoplay).toBe(false);
	});

	it("deletes the selected file, falls forward to the next file, and clears stale playback search params", async () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
			createAudioFile({ id: "file-3", title: "Mix C" }),
		];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		const confirmSpy = vi.fn(() => true);
		vi.stubGlobal("confirm", confirmSpy);

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{
					fileId: "file-2",
					annotationId: "annotation-2",
					timeMs: 91000,
					autoplay: true,
				}}
			/>,
		);

		deleteAudioFile.mockClear();
		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		deleteFile("Mix B");

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this file?");
			expect(deleteAudioFile).toHaveBeenCalledWith("file-2");
		});
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});

		const navigateArg = navigateMock.mock.calls.find(
			(call) =>
				call[0] &&
				typeof call[0] === "object" &&
				"search" in call[0] &&
				typeof (call[0] as { search?: unknown }).search === "function",
		)?.[0] as {
			replace?: boolean;
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		expect(navigateArg?.replace).toBe(true);
		const nextSearch = navigateArg.search({
			fileId: "file-2",
			annotationId: "annotation-2",
			timeMs: 91000,
			autoplay: true,
		});
		expect(nextSearch.fileId).toBe("file-3");
		expect(nextSearch.annotationId).toBeUndefined();
		expect(nextSearch.timeMs).toBeUndefined();
		expect(nextSearch.autoplay).toBe(false);
	});

	it("falls back to the previous file when deleting the last file", async () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{ fileId: "file-2", autoplay: false }}
			/>,
		);

		deleteAudioFile.mockClear();
		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		deleteFile("Mix B");

		await waitFor(() => {
			expect(deleteAudioFile).toHaveBeenCalledWith("file-2");
		});
	});

	it("clears file selection in route and workspace when deleting the only file", async () => {
		currentAudioFiles = [createAudioFile({ id: "file-1", title: "Only Mix" })];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{ fileId: "file-1", timeMs: 5000, autoplay: true }}
			/>,
		);

		deleteAudioFile.mockClear();
		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		deleteFile("Only Mix");

		await waitFor(() => {
			expect(deleteAudioFile).toHaveBeenCalledWith("file-1");
		});

		const navigateArg = navigateMock.mock.calls.find(
			(call) =>
				call[0] &&
				typeof call[0] === "object" &&
				"search" in call[0] &&
				typeof (call[0] as { search?: unknown }).search === "function",
		)?.[0] as {
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		const nextSearch = navigateArg.search({
			fileId: "file-1",
			annotationId: "annotation-1",
			timeMs: 5000,
			autoplay: true,
		});
		expect(nextSearch.fileId).toBeUndefined();
		expect(nextSearch.annotationId).toBeUndefined();
		expect(nextSearch.timeMs).toBeUndefined();
		expect(nextSearch.autoplay).toBe(false);
	});

	it("does not delete when file deletion is canceled", async () => {
		currentAudioFiles = [createAudioFile({ id: "file-1", title: "Mix A" })];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		const confirmSpy = vi.fn(() => false);
		vi.stubGlobal("confirm", confirmSpy);

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		deleteAudioFile.mockClear();
		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		deleteFile("Mix A");

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this file?");
		});
		expect(deleteAudioFile).not.toHaveBeenCalled();
		expect(updateWorkspaceStateMock).not.toHaveBeenCalled();
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("steps file volume by 1 dB through the persisted audio update path", async () => {
		currentAudioFiles = [createAudioFile()];
		updateAudioFile.mockResolvedValue(undefined);

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.click(screen.getByRole("button", { name: "+" }));

		await waitFor(() => {
			expect(updateAudioFile).toHaveBeenCalledWith("file-1", {
				volumeDb: 1,
			});
		});
	});

	it("updates file metadata from the waveform card", async () => {
		currentAudioFiles = [createAudioFile({ title: "Mix A" })];
		updateAudioFile.mockResolvedValue(undefined);

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.click(screen.getByRole("button", { name: /^rename mix a$/i }));

		await waitFor(() => {
			expect(updateAudioFile).toHaveBeenCalledWith("file-1", {
				title: "Mix A - Print",
				sessionDate: "2026-04-18",
			});
		});
	});

	it("rewinds and fast-forwards 5 seconds with comma and period, including key repeat", () => {
		currentAudioFiles = [createAudioFile()];
		seekActiveBy.mockClear();

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.keyDown(window, { key: ",", code: "Comma" });
		fireEvent.keyDown(window, { key: ".", code: "Period" });
		fireEvent.keyDown(window, { key: ",", code: "Comma", repeat: true });

		expect(seekActiveBy).toHaveBeenNthCalledWith(1, -5000);
		expect(seekActiveBy).toHaveBeenNthCalledWith(2, 5000);
		expect(seekActiveBy).toHaveBeenNthCalledWith(3, -5000);
	});

	it("seeks 1 second when holding shift with comma and period", () => {
		currentAudioFiles = [createAudioFile()];
		seekActiveBy.mockClear();

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.keyDown(window, {
			key: "<",
			code: "Comma",
			shiftKey: true,
		});
		fireEvent.keyDown(window, {
			key: ">",
			code: "Period",
			shiftKey: true,
		});

		expect(seekActiveBy).toHaveBeenNthCalledWith(1, -1000);
		expect(seekActiveBy).toHaveBeenNthCalledWith(2, 1000);
	});

	it("deletes the active marker from the keyboard with the same confirmation as drag-delete", async () => {
		currentAudioFiles = [createAudioFile()];
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-keyboard",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Hit",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		const confirmSpy = vi.fn(() => true);
		vi.stubGlobal("confirm", confirmSpy);
		deleteAnnotation.mockClear();
		navigateMock.mockClear();

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{
					fileId: "file-1",
					annotationId: "annotation-keyboard",
					autoplay: false,
				}}
			/>,
		);

		fireEvent.keyDown(window, { key: "Delete" });

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
			expect(deleteAnnotation).toHaveBeenCalledWith("annotation-keyboard");
		});
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});

		const navigateArg = navigateMock.mock.calls.find(
			(call) =>
				call[0] &&
				typeof call[0] === "object" &&
				"search" in call[0] &&
				typeof (call[0] as { search?: unknown }).search === "function",
		)?.[0] as {
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		const nextSearch = navigateArg.search({
			fileId: "file-1",
			annotationId: "annotation-keyboard",
			autoplay: false,
		});
		expect(nextSearch.fileId).toBe("file-1");
		expect(nextSearch.annotationId).toBeUndefined();
		expect(nextSearch.timeMs).toBeUndefined();
		expect(nextSearch.autoplay).toBe(false);
	});

	it("deletes the active range marker when pressing Backspace", async () => {
		currentAudioFiles = [createAudioFile()];
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-range-kb",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "range",
					startMs: 1000,
					endMs: 5000,
					title: "Section",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		deleteAnnotation.mockClear();

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{
					fileId: "file-1",
					annotationId: "annotation-range-kb",
					autoplay: false,
				}}
			/>,
		);

		fireEvent.keyDown(window, { key: "Backspace" });

		await waitFor(() => {
			expect(deleteAnnotation).toHaveBeenCalledWith("annotation-range-kb");
		});
	});

	it("does not delete the active marker when keyboard confirmation is canceled", async () => {
		currentAudioFiles = [createAudioFile()];
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-nope",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Hit",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		const confirmSpy = vi.fn(() => false);
		vi.stubGlobal("confirm", confirmSpy);
		deleteAnnotation.mockClear();

		render(
			<SongWorkspace
				songId={baseSong.id}
				search={{
					fileId: "file-1",
					annotationId: "annotation-nope",
					autoplay: false,
				}}
			/>,
		);

		fireEvent.keyDown(window, { key: "Delete" });

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		});
		expect(deleteAnnotation).not.toHaveBeenCalled();
	});

	it("keeps a zero live playhead instead of falling back to workspace playhead", () => {
		currentAudioFiles = [createAudioFile()];
		currentWorkspace = {
			playheadMsByFileId: {
				"file-1": 45000,
			},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: false,
			currentTimeByFileId: {
				"file-1": 0,
			},
		};

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.getByText("0 ms")).toBeTruthy();
	});

	it("activates the crossed marker when live playback moves forward past it", async () => {
		currentAudioFiles = [createAudioFile()];
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-1",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Intro",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: true,
			currentTimeByFileId: {
				"file-1": 500,
			},
		};

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		navigateMock.mockClear();
		currentPlayback = {
			...currentPlayback,
			currentTimeByFileId: {
				"file-1": 1000,
			},
		};
		rerender(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});
		const navigateArg = navigateMock.mock.calls.at(-1)?.[0] as {
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		const nextSearch = navigateArg.search({ autoplay: false });
		expect(nextSearch.fileId).toBe("file-1");
		expect(nextSearch.annotationId).toBe("annotation-1");
	});

	it("activates the crossed marker when playback moves backward across it", async () => {
		currentAudioFiles = [createAudioFile()];
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-1",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Intro",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
				{
					id: "annotation-2",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 2500,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: true,
			currentTimeByFileId: {
				"file-1": 3000,
			},
		};

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		navigateMock.mockClear();
		currentPlayback = {
			...currentPlayback,
			currentTimeByFileId: {
				"file-1": 2500,
			},
		};
		rerender(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});
		const navigateArg = navigateMock.mock.calls.at(-1)?.[0] as {
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		const nextSearch = navigateArg.search({ autoplay: false });
		expect(nextSearch.fileId).toBe("file-1");
		expect(nextSearch.annotationId).toBe("annotation-2");
	});

	it("resets the crossing baseline when the active playback file changes", async () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];
		currentAnnotationsByFileId = {
			"file-2": [
				{
					id: "annotation-2",
					songId: baseSong.id,
					audioFileId: "file-2",
					type: "point",
					startMs: 1000,
					title: "Intro",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: true,
			currentTimeByFileId: {
				"file-1": 500,
			},
		};

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		navigateMock.mockClear();
		currentPlayback = {
			activeFileId: "file-2",
			isPlaying: true,
			currentTimeByFileId: {
				"file-1": 500,
				"file-2": 1500,
			},
		};
		rerender(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);

		await waitFor(() => {
			expect(navigateMock).not.toHaveBeenCalled();
		});
	});

	it("does not switch the selected file when another playing file crosses a marker", async () => {
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		currentAnnotationsByFileId = {
			"file-1": [
				{
					id: "annotation-1",
					songId: baseSong.id,
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Intro",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: true,
			currentTimeByFileId: {
				"file-1": 500,
			},
		};

		const { rerender } = render(
			<SongWorkspace
				songId={baseSong.id}
				search={{ fileId: "file-2", autoplay: false }}
			/>,
		);

		expect(screen.getByTestId("waveform-card").textContent).toContain(
			"Mix B:true",
		);
		expect(
			screen.getByRole("button", { name: "Select file-1" }).textContent,
		).toContain("Mix A:false");

		navigateMock.mockClear();
		currentPlayback = {
			...currentPlayback,
			currentTimeByFileId: {
				"file-1": 1200,
			},
		};
		rerender(
			<SongWorkspace
				songId={baseSong.id}
				search={{ fileId: "file-2", autoplay: false }}
			/>,
		);

		await waitFor(() => {
			expect(navigateMock).not.toHaveBeenCalled();
		});
		expect(screen.getByTestId("waveform-card").textContent).toContain(
			"Mix B:true",
		);
		expect(
			screen.getByRole("button", { name: "Select file-1" }).textContent,
		).toContain("Mix A:false");
	});

	it("opens the upload form inside a modal when add file is clicked", () => {
		currentAudioFiles = [createAudioFile()];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /add file/i }));

		expect(
			screen.getByRole("dialog", {
				name: /add file/i,
			}),
		).toBeTruthy();
		expect(screen.getByLabelText(/audio file/i)).toBeTruthy();
		expect(screen.getByPlaceholderText(/context for this file/i)).toBeTruthy();
	});

	it("closes the upload modal on Escape", () => {
		currentAudioFiles = [createAudioFile()];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.click(screen.getByRole("button", { name: /add file/i }));
		expect(screen.getByRole("dialog", { name: /add file/i })).toBeTruthy();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: /add file/i })).toBeNull();
	});

	it("renders the journal editor without an outer journal shell", () => {
		currentAudioFiles = [createAudioFile()];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		const journalEditor = document.querySelector(
			'[data-audio-versions-editor="journal"]',
		);
		const journalColumn = journalEditor?.parentElement?.parentElement;

		expect(screen.queryByText(/song journal/i)).toBeNull();
		expect(journalEditor).toBeTruthy();
		expect(journalEditor?.closest(".panel-shell")).toBeNull();
		expect(journalColumn?.className).toContain("xl:min-h-0");
		expect(journalColumn?.className).toContain("song-workspace-journal-column");
	});

	it("lets the journal pane absorb extra width after panels are resized", () => {
		currentAudioFiles = [createAudioFile()];
		const originalInnerWidth = window.innerWidth;
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: 1600,
		});

		const { container } = render(
			<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />,
		);
		const panels = [
			...container.querySelectorAll<HTMLElement>("[data-song-workspace-panel]"),
		];
		for (const [index, panel] of panels.entries()) {
			vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
				bottom: 0,
				height: 0,
				left: 0,
				right: 0,
				toJSON: () => ({}),
				top: 0,
				width: [600, 500, 420][index],
				x: 0,
				y: 0,
			});
		}

		fireEvent.keyDown(
			screen.getByRole("button", {
				name: "Resize details and journal panels",
			}),
			{ key: "ArrowLeft" },
		);

		const grid = container.querySelector<HTMLElement>(
			".song-workspace-panel-grid",
		);
		expect(
			grid?.style.getPropertyValue("--song-workspace-right-panel-width"),
		).toBe("minmax(436px, 1fr)");

		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: originalInnerWidth,
		});
	});

	it("renders the song controls into the header slot when one is available", () => {
		currentAudioFiles = [createAudioFile()];

		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		const { container, unmount } = render(
			<HeaderSlotsContext.Provider
				value={{
					library: { enabled: false, slot: null },
					song: { enabled: true, slot: headerSlot },
				}}
			>
				<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />
			</HeaderSlotsContext.Provider>,
		);

		expect(
			within(headerSlot).getByRole("heading", {
				level: 1,
				name: /reload test/i,
			}),
		).toBeTruthy();
		expect(
			within(headerSlot).getByRole("button", { name: /add file/i }),
		).toBeTruthy();
		expect(
			within(container.querySelector("main") as HTMLElement).queryByRole(
				"button",
				{ name: /add file/i },
			),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("textbox", { name: /song title/i }),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("textbox", { name: /^artist$/i }),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("textbox", { name: /^project$/i }),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("button", {
				name: /edit settings for reload test/i,
			}),
		).toBeNull();

		unmount();
		headerSlot.remove();
	});

	it("does not render artist and project controls in the song header", () => {
		currentAudioFiles = [createAudioFile()];
		currentUiSettings = {
			...currentUiSettings,
			showArtist: false,
			showProject: false,
		};

		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		render(
			<HeaderSlotsContext.Provider
				value={{
					library: { enabled: false, slot: null },
					song: { enabled: true, slot: headerSlot },
				}}
			>
				<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />
			</HeaderSlotsContext.Provider>,
		);

		expect(
			within(headerSlot).queryByRole("textbox", { name: /song title/i }),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("textbox", { name: /^artist$/i }),
		).toBeNull();
		expect(
			within(headerSlot).queryByRole("textbox", { name: /^project$/i }),
		).toBeNull();
	});
});
