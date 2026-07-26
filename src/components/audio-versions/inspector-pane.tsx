import { useState } from "react";
import { copySongTargetLink } from "#/lib/audio-versions/clipboard";
import { DEBOUNCE_MS } from "#/lib/audio-versions/debounce-delays";
import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongLinkTarget,
} from "#/lib/audio-versions/types";
import { InspectorMarkerCard } from "./inspector-marker-card";
import { RichTextEditor } from "./rich-text-editor";

interface InspectorPaneProps {
	song: Song;
	selectedFile?: AudioFileRecord;
	annotations: Annotation[];
	activeAnnotation?: Annotation;
	onOpenTarget: (target: SongLinkTarget) => void;
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	annotationTitleFocusId?: string | null;
	onAnnotationTitleFocusHandled?: () => void;
}

export function InspectorPane({
	song,
	selectedFile,
	annotations,
	activeAnnotation,
	onOpenTarget,
	onUpdateFile,
	onUpdateAnnotation,
	onDeleteAnnotation,
	onSelectAnnotation,
	annotationTitleFocusId = null,
	onAnnotationTitleFocusHandled = () => {},
}: InspectorPaneProps) {
	const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

	async function copyLink(target: SongLinkTarget, label: string) {
		try {
			await copySongTargetLink(target, label);
			setCopiedMessage(`${label} link copied`);
		} catch {
			setCopiedMessage("Couldn’t copy link");
		}
		window.setTimeout(() => setCopiedMessage(null), 1400);
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			<section className="relative flex h-full min-h-0 flex-col px-6 py-4 xl:py-0">
				<div className="-mx-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 xl:pt-0 xl:pb-5 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)]">
					{selectedFile ? (
						<div className="inspector-file-notes shrink-0 xl:-mt-2">
							{/*
							  h-16 matches the Song Notes toolbar so the File Notes
							  input top lines up with the Song Notes input top.
							*/}
							<div className="flex h-16 items-center">
								<span className="field-label">File Notes</span>
							</div>
							<RichTextEditor
								value={selectedFile.notes}
								onChange={(nextValue) =>
									void onUpdateFile({
										notes: nextValue,
									})
								}
								onInternalLink={onOpenTarget}
								compact
								showToolbar={false}
								commitDelayMs={DEBOUNCE_MS.compactEditor}
							/>
						</div>
					) : null}
					{annotations.length === 0 ? (
						<div
							className={`grid shrink-0 gap-2 ${selectedFile ? "mt-4" : ""}`}
						>
							<h4 className="field-label">Markers and Ranges</h4>
							<p className="text-sm text-[var(--color-text-muted)]">
								Create markers or ranges from the waveform to build the list.
							</p>
						</div>
					) : (
						<>
							<h4
								className={`field-label shrink-0 ${selectedFile ? "mt-4" : ""}`}
							>
								Markers and Ranges
							</h4>
							{annotations.map((annotation) => (
								<InspectorMarkerCard
									key={annotation.id}
									annotation={annotation}
									isActive={activeAnnotation?.id === annotation.id}
									selectedFile={selectedFile}
									songId={song.id}
									requestTitleFocus={annotationTitleFocusId === annotation.id}
									onTitleFocusHandled={onAnnotationTitleFocusHandled}
									onOpenTarget={onOpenTarget}
									onSelectAnnotation={onSelectAnnotation}
									onUpdateAnnotation={onUpdateAnnotation}
									onDeleteAnnotation={onDeleteAnnotation}
									onCopyLink={copyLink}
								/>
							))}
						</>
					)}
				</div>
				{copiedMessage ? (
					<div className="mt-2 flex shrink-0 justify-end">
						<span className="surface-chip px-3 py-1 text-xs">
							{copiedMessage}
						</span>
					</div>
				) : null}
				{!selectedFile ? (
					<p className="text-sm leading-7 text-[var(--color-text-muted)]">
						Pick an audio lane to edit notes, inspect time-based annotations,
						and copy deep links back into the song notes.
					</p>
				) : null}
			</section>
		</div>
	);
}
