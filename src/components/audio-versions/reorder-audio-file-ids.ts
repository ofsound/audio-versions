export function reorderAudioFileIds(
	orderedIds: string[],
	draggingFileId: string,
	targetFileId: string,
): string[] | null {
	if (!draggingFileId || draggingFileId === targetFileId) {
		return null;
	}

	const nextOrderedIds = [...orderedIds];
	const fromIndex = nextOrderedIds.indexOf(draggingFileId);
	const toIndex = nextOrderedIds.indexOf(targetFileId);
	if (fromIndex === -1 || toIndex === -1) {
		return null;
	}

	nextOrderedIds.splice(fromIndex, 1);
	nextOrderedIds.splice(toIndex, 0, draggingFileId);
	return nextOrderedIds;
}
