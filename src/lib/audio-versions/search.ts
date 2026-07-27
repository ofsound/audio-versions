import { richTextPreview, richTextToPlainText } from "./rich-text";
import type {
	Annotation,
	AudioFileRecord,
	AudioVersionsUiSettings,
	SearchResult,
	Song,
	SongLinkTarget,
} from "./types";

interface SearchSnapshot {
	songs: Song[];
	audioFiles: AudioFileRecord[];
	annotations: Annotation[];
}

export function searchAudioVersions(
	snapshot: SearchSnapshot,
	query: string,
	uiSettings: AudioVersionsUiSettings,
): SearchResult[] {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	if (!terms.length) {
		return [];
	}

	const audioBySong = groupBy(
		snapshot.audioFiles,
		(audioFile) => audioFile.songId,
	);
	const annotationsByFile = groupBy(
		snapshot.annotations,
		(annotation) => annotation.audioFileId,
	);
	const results: SearchResult[] = [];

	for (const song of snapshot.songs) {
		const songPlain = `${song.title} ${song.artist} ${song.project} ${song.generalNotes}`;
		pushMatch(
			results,
			buildScore(song.title, songPlain, terms, 2.5),
			[song.title, uiSettings.showArtist && song.artist ? song.artist : null]
				.filter(Boolean)
				.join(" · "),
			uiSettings.showProject && song.project ? song.project : "Song",
			plainTextPreview(song.generalNotes, "Open song workspace"),
			{
				songId: song.id,
			},
			`song:${song.id}`,
			"song",
		);

		pushMatch(
			results,
			buildScore("journal", song.generalNotes, terms, 1.3),
			`${song.title} song notes`,
			uiSettings.showProject && song.project ? song.project : "Song notes",
			plainTextPreview(song.generalNotes),
			{
				songId: song.id,
			},
			`journal:${song.id}`,
			"journal",
		);

		for (const audioFile of audioBySong[song.id] ?? []) {
			const audioPlain = `${audioFile.title} ${audioFile.sessionDate} ${richTextToPlainText(audioFile.notes)}`;
			pushMatch(
				results,
				buildScore(audioFile.title, audioPlain, terms, 1.9),
				audioFile.title,
				song.title,
				richTextPreview(audioFile.notes, "Open file notes"),
				{
					songId: song.id,
					fileId: audioFile.id,
				},
				`file:${audioFile.id}`,
				"file",
			);

			for (const annotation of annotationsByFile[audioFile.id] ?? []) {
				const annotationPlain = richTextToPlainText(annotation.detail);
				const resultTitle = richTextPreview(
					annotation.detail,
					annotation.type === "range" ? "Untitled range" : "Untitled marker",
				);
				pushMatch(
					results,
					buildScore(annotationPlain, "", terms, 2.2),
					resultTitle,
					`${song.title} · ${audioFile.title}`,
					"Jump to annotation",
					{
						songId: song.id,
						fileId: audioFile.id,
						annotationId: annotation.id,
						timeMs: annotation.startMs,
						autoplay: true,
					},
					`annotation:${annotation.id}`,
					"annotation",
				);
			}
		}
	}

	return results.sort((left, right) => right.score - left.score).slice(0, 18);
}

function plainTextPreview(value: string, fallback = "No notes yet."): string {
	const text = value.replace(/\s+/g, " ").trim();
	if (!text) {
		return fallback;
	}

	return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function buildScore(
	title: string,
	body: string,
	terms: string[],
	bias: number,
): number {
	const haystackTitle = title.toLowerCase();
	const haystackBody = body.toLowerCase();
	let score = 0;

	for (const term of terms) {
		if (haystackTitle.includes(term)) {
			score += 4;
		}

		if (haystackBody.includes(term)) {
			score += 1.5;
		}
	}

	return score * bias;
}

function pushMatch(
	results: SearchResult[],
	score: number,
	title: string,
	subtitle: string,
	snippet: string,
	target: SongLinkTarget,
	id: string,
	type: SearchResult["type"],
): void {
	if (score <= 0) {
		return;
	}

	results.push({
		id,
		type,
		title,
		subtitle,
		snippet,
		target,
		score,
	});
}

function groupBy<T>(
	items: T[],
	getKey: (item: T) => string,
): Record<string, T[]> {
	return items.reduce<Record<string, T[]>>((accumulator, item) => {
		const key = getKey(item);
		accumulator[key] ??= [];
		accumulator[key].push(item);
		return accumulator;
	}, {});
}
