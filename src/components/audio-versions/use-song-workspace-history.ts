import { useCallback, useRef } from "react";

interface SongWorkspaceHistoryEntry {
	undo: () => Promise<void>;
	redo: () => Promise<void>;
	mergeKey?: string;
}

interface StoredHistoryEntry extends SongWorkspaceHistoryEntry {
	recordedAt: number;
}

const HISTORY_LIMIT = 100;
const HISTORY_MERGE_WINDOW_MS = 750;

export function useSongWorkspaceHistory(songId: string) {
	const undoStackRef = useRef<StoredHistoryEntry[]>([]);
	const redoStackRef = useRef<StoredHistoryEntry[]>([]);
	const applyingRef = useRef(false);
	const songIdRef = useRef(songId);
	if (songIdRef.current !== songId) {
		songIdRef.current = songId;
		undoStackRef.current = [];
		redoStackRef.current = [];
		applyingRef.current = false;
	}

	const record = useCallback((entry: SongWorkspaceHistoryEntry) => {
		if (applyingRef.current) {
			return;
		}

		const recordedAt = Date.now();
		const previous = undoStackRef.current.at(-1);
		if (
			entry.mergeKey &&
			previous?.mergeKey === entry.mergeKey &&
			recordedAt - previous.recordedAt <= HISTORY_MERGE_WINDOW_MS
		) {
			undoStackRef.current[undoStackRef.current.length - 1] = {
				...entry,
				undo: previous.undo,
				recordedAt,
			};
		} else {
			undoStackRef.current.push({ ...entry, recordedAt });
			if (undoStackRef.current.length > HISTORY_LIMIT) {
				undoStackRef.current.shift();
			}
		}
		redoStackRef.current = [];
	}, []);

	const moveEntry = useCallback(
		async (
			source: React.RefObject<StoredHistoryEntry[]>,
			target: React.RefObject<StoredHistoryEntry[]>,
			action: "undo" | "redo",
		) => {
			if (applyingRef.current) {
				return false;
			}
			const entry = source.current.at(-1);
			if (!entry) {
				return false;
			}

			source.current.pop();
			applyingRef.current = true;
			try {
				await entry[action]();
				target.current.push({ ...entry, recordedAt: Date.now() });
				return true;
			} catch (error) {
				source.current.push(entry);
				throw error;
			} finally {
				applyingRef.current = false;
			}
		},
		[],
	);

	const undo = useCallback(
		() => moveEntry(undoStackRef, redoStackRef, "undo"),
		[moveEntry],
	);
	const redo = useCallback(
		() => moveEntry(redoStackRef, undoStackRef, "redo"),
		[moveEntry],
	);
	const acceptLocalHistoryAction = useCallback((action: "undo" | "redo") => {
		const source =
			action === "undo" ? undoStackRef.current : redoStackRef.current;
		const target =
			action === "undo" ? redoStackRef.current : undoStackRef.current;
		const entry = source.pop();
		if (entry) {
			target.push({ ...entry, recordedAt: Date.now() });
		}
	}, []);

	return { acceptLocalHistoryAction, record, redo, undo };
}
