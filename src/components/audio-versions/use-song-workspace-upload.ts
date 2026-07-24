import { type FormEvent, useCallback, useEffect, useState } from "react";
import { titleFromAudioFileName } from "#/lib/audio-versions/audio-file-drop";
import { isoDateInLocalCalendar } from "#/lib/audio-versions/dates";
import { plainTextToRichText } from "#/lib/audio-versions/rich-text";

interface UseSongWorkspaceUploadOptions {
	addAudioFile: (
		songId: string,
		input: {
			file: File;
			title: string;
			sessionDate: string;
			notes: ReturnType<typeof plainTextToRichText>;
		},
	) => Promise<{ id: string }>;
	patchRouteSelection: (options: {
		fileId?: string;
		annotationId?: string;
		clearPlaybackParams?: boolean;
	}) => void;
	songId: string;
}

export function useSongWorkspaceUpload({
	addAudioFile,
	patchRouteSelection,
	songId,
}: UseSongWorkspaceUploadOptions) {
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadTitle, setUploadTitle] = useState("");
	const [uploadNotes, setUploadNotes] = useState("");
	const [uploadSessionDate, setUploadSessionDate] = useState(() =>
		isoDateInLocalCalendar(),
	);

	useEffect(() => {
		if (isUploadOpen) {
			setUploadSessionDate(isoDateInLocalCalendar());
		}
	}, [isUploadOpen]);

	useEffect(() => {
		if (!isUploadOpen) {
			return;
		}

		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = overflow;
		};
	}, [isUploadOpen]);

	const beginUploadWithFile = useCallback((file: File) => {
		setUploadFile(file);
		setUploadTitle(titleFromAudioFileName(file.name));
		setUploadError(null);
		setIsUploadOpen(true);
	}, []);

	async function handleUpload(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!uploadFile) {
			return;
		}

		setUploading(true);
		setUploadError(null);
		try {
			const audioFile = await addAudioFile(songId, {
				file: uploadFile,
				title: uploadTitle,
				sessionDate: uploadSessionDate,
				notes: plainTextToRichText(uploadNotes),
			});
			patchRouteSelection({
				fileId: audioFile.id,
				clearPlaybackParams: true,
			});

			setUploadFile(null);
			setUploadTitle("");
			setUploadNotes("");
			setIsUploadOpen(false);
		} catch (uploadFailure) {
			setUploadError(
				uploadFailure instanceof Error
					? uploadFailure.message
					: "Audio Versions could not import that audio file.",
			);
		} finally {
			setUploading(false);
		}
	}

	return {
		beginUploadWithFile,
		handleUpload,
		isUploadOpen,
		setIsUploadOpen,
		uploadError,
		uploadFile,
		uploadNotes,
		uploadSessionDate,
		uploadTitle,
		uploading,
		setUploadFile,
		setUploadNotes,
		setUploadSessionDate,
		setUploadTitle,
	};
}
