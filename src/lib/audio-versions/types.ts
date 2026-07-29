export type AnnotationType = "point" | "range";

export interface RichTextMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface RichTextNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: RichTextMark[];
	content?: RichTextNode[];
}

export interface RichTextDoc {
	type: "doc";
	content?: RichTextNode[];
}

export interface WaveformData {
	peaks: number[];
	peakCount: number;
	durationMs: number;
	sampleRate: number;
}

/** Whole-file loudness measurements (ITU-R BS.1770-4 / EBU Tech 3342). */
export interface LoudnessMetrics {
	/** Gated program loudness in LUFS. */
	integratedLufs: number;
	/** Loudness range in LU. */
	loudnessRangeLu: number;
	/** Loudest gated 3 s window in LUFS. */
	shortTermMaxLufs: number;
	/** Highest sample value in dBFS. */
	samplePeakDb: number;
	/** Highest 4x oversampled value in dBTP. */
	truePeakDb: number;
}

export interface Song {
	id: string;
	title: string;
	artist: string;
	project: string;
	generalNotes: string;
	audioFileOrder: string[];
	createdAt: string;
	updatedAt: string;
}

export interface AudioFileRecord {
	id: string;
	songId: string;
	title: string;
	/** Local calendar session date `YYYY-MM-DD` (mix / ref date). */
	sessionDate: string;
	notes: RichTextDoc;
	volumeDb: number;
	durationMs: number;
	waveform: WaveformData;
	loudness?: LoudnessMetrics;
	remoteMedia?: {
		pathname: string;
		contentType: string;
		size: number;
		originalName: string;
	};
	createdAt: string;
	updatedAt: string;
}

export interface Annotation {
	id: string;
	songId: string;
	audioFileId: string;
	type: AnnotationType;
	startMs: number;
	endMs?: number;
	detail: RichTextDoc;
	color?: string;
	createdAt: string;
	updatedAt: string;
}

export interface WorkspaceState {
	playheadMsByFileId: Record<string, number>;
	inspectorRatio: number;
	lastVisitedAt: string | null;
}

const WAVEFORM_HEIGHT_PRESETS = ["large", "medium", "small"] as const;

export type WaveformHeightPreset = (typeof WAVEFORM_HEIGHT_PRESETS)[number];

export interface AudioVersionsUiSettings {
	accentLightPrimary: string;
	accentLightStrong: string;
	accentDarkPrimary: string;
	accentDarkStrong: string;
	waveformHeight: WaveformHeightPreset;
	showArtist: boolean;
	showProject: boolean;
	/** When true, :focus-visible uses accent rings (recommended for keyboard use). */
	keyboardFocusHighlights: boolean;
}

export interface AudioVersionsSettings {
	recents: string[];
	lastOpenSongId?: string;
	workspaceBySongId: Record<string, WorkspaceState>;
	ui: AudioVersionsUiSettings;
}

export interface AudioVersionsSnapshot {
	songs: Song[];
	audioFiles: AudioFileRecord[];
	annotations: Annotation[];
	blobsByAudioId: Record<string, Blob>;
	settings: AudioVersionsSettings;
}

export interface SongLinkTarget {
	songId: string;
	fileId?: string;
	annotationId?: string;
	timeMs?: number;
	autoplay?: boolean;
}

export interface SongRouteSearch {
	fileId?: string;
	annotationId?: string;
	timeMs?: number;
	autoplay?: boolean;
}

export type SearchResultType = "song" | "file" | "annotation" | "journal";

export interface SearchResult {
	id: string;
	type: SearchResultType;
	title: string;
	subtitle: string;
	snippet: string;
	target: SongLinkTarget;
	score: number;
}

export interface CreateSongInput {
	title: string;
	artist: string;
	project: string;
	generalNotes: string;
}

export interface AddAudioFileInput {
	file: File;
	title: string;
	/** `YYYY-MM-DD` from `<input type="date" />`. */
	sessionDate: string;
	notes: RichTextDoc;
}

export interface CreateAnnotationInput {
	songId: string;
	audioFileId: string;
	type: AnnotationType;
	startMs: number;
	endMs?: number;
	detail: RichTextDoc;
	color?: string;
}

export function createDefaultWorkspaceState(): WorkspaceState {
	return {
		playheadMsByFileId: {},
		inspectorRatio: 0.56,
		lastVisitedAt: null,
	};
}

export function createDefaultUiSettings(): AudioVersionsUiSettings {
	return {
		accentLightPrimary: "#059669",
		accentLightStrong: "#047857",
		accentDarkPrimary: "#6ee7b7",
		accentDarkStrong: "#a7f3d0",
		waveformHeight: "medium",
		showArtist: true,
		showProject: true,
		keyboardFocusHighlights: false,
	};
}

export function createEmptySettings(): AudioVersionsSettings {
	return {
		recents: [],
		workspaceBySongId: {},
		ui: createDefaultUiSettings(),
	};
}

function normalizeWaveformHeightPreset(
	_value: string | null | undefined,
): WaveformHeightPreset {
	return "medium";
}

function normalizeHexColor(
	value: string | null | undefined,
	fallback: string,
): string {
	return /^#[0-9a-f]{6}$/i.test(value ?? "") ? (value ?? fallback) : fallback;
}

export function normalizeUiSettings(
	value: Partial<AudioVersionsUiSettings> | null | undefined,
): AudioVersionsUiSettings {
	const defaults = createDefaultUiSettings();

	return {
		accentLightPrimary: normalizeHexColor(
			value?.accentLightPrimary,
			defaults.accentLightPrimary,
		).toLowerCase(),
		accentLightStrong: normalizeHexColor(
			value?.accentLightStrong,
			defaults.accentLightStrong,
		).toLowerCase(),
		accentDarkPrimary: normalizeHexColor(
			value?.accentDarkPrimary,
			defaults.accentDarkPrimary,
		).toLowerCase(),
		accentDarkStrong: normalizeHexColor(
			value?.accentDarkStrong,
			defaults.accentDarkStrong,
		).toLowerCase(),
		waveformHeight: normalizeWaveformHeightPreset(value?.waveformHeight),
		showArtist: value?.showArtist ?? defaults.showArtist,
		showProject: value?.showProject ?? defaults.showProject,
		keyboardFocusHighlights:
			value?.keyboardFocusHighlights ?? defaults.keyboardFocusHighlights,
	};
}

export function normalizeAudioVersionsSettings(
	value: Partial<AudioVersionsSettings> | null | undefined,
): AudioVersionsSettings {
	const defaults = createEmptySettings();

	return {
		recents: value?.recents ?? defaults.recents,
		lastOpenSongId: value?.lastOpenSongId,
		workspaceBySongId: value?.workspaceBySongId ?? defaults.workspaceBySongId,
		ui: normalizeUiSettings(value?.ui),
	};
}
