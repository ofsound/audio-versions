const AUDIO_FILE_EXTENSION_PATTERN =
	/\.(aac|aif|aiff|flac|m4a|mp3|ogg|opus|wav|webm)$/i;

export function isAudioFile(file: File): boolean {
	if (file.type.startsWith("audio/")) {
		return true;
	}

	return AUDIO_FILE_EXTENSION_PATTERN.test(file.name);
}

export function dataTransferLooksLikeFileDrag(
	dataTransfer: DataTransfer | null,
): boolean {
	if (!dataTransfer) {
		return false;
	}

	return [...dataTransfer.types].includes("Files");
}

export function getAudioFileFromDataTransfer(
	dataTransfer: DataTransfer | null,
): File | null {
	if (!dataTransfer) {
		return null;
	}

	for (const file of dataTransfer.files) {
		if (isAudioFile(file)) {
			return file;
		}
	}

	return null;
}

export function titleFromAudioFileName(fileName: string): string {
	return fileName.replace(/\.[^.]+$/, "");
}
