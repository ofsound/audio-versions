import { useLocation } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { LibraryPreviewAudio } from "./library-preview-audio";

interface LibraryPreview {
	fileId?: string;
	element: HTMLAudioElement | null;
	error: string | null;
	setFileId: (id?: string) => void;
}
const LibraryPreviewContext = createContext<LibraryPreview | null>(null);
export function useLibraryPreview() {
	return useContext(LibraryPreviewContext);
}

// The preview transport lives above routes so entering its song never detaches
// the playing media element or its Web Audio graph.
export function LibraryPreviewProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { audioFiles, blobsByAudioId, songs } = useAudioVersions();
	const pathname = useLocation({ select: (location) => location.pathname });
	const [fileId, setFileId] = useState<string>();
	const [element, setElement] = useState<HTMLAudioElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const file = audioFiles.find(
		(file) =>
			file.id === fileId && songs.some((song) => song.id === file.songId),
	);
	const allowed = pathname === "/" || pathname === `/songs/${file?.songId}`;
	useEffect(() => {
		if (!allowed || (fileId && !file)) setFileId(undefined);
	}, [allowed, fileId, file]);
	return (
		<LibraryPreviewContext.Provider
			value={{
				fileId,
				element,
				error,
				setFileId: (id) => {
					setError(null);
					setFileId(id);
				},
			}}
		>
			{file && allowed && (
				<LibraryPreviewAudio
					key={file.id}
					audioFile={file}
					blob={blobsByAudioId[file.id]}
					onElement={setElement}
					onStop={() => {
						if (pathname === "/") setFileId(undefined);
					}}
					onError={(message) => {
						setError(message);
						setFileId(undefined);
					}}
				/>
			)}
			{children}
		</LibraryPreviewContext.Provider>
	);
}
