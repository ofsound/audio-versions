import { Copy, Trash2 } from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { DEBOUNCE_MS } from "#/lib/version-compare/debounce-delays";
import type {
	Annotation,
	AudioFileRecord,
	RichTextDoc,
	SongLinkTarget,
} from "#/lib/version-compare/types";
import { MarkerTimeField } from "./marker-time-field";
import { RichTextEditor } from "./rich-text-editor";
import { useBufferedInputValue } from "./use-buffered-input-value";
import { useDebouncedAsyncCallback } from "./use-debounced-async-callback";

interface InspectorMarkerCardProps {
	annotation: Annotation;
	isActive: boolean;
	selectedFile?: Pick<AudioFileRecord, "durationMs" | "title">;
	songId: string;
	onOpenTarget: (target: SongLinkTarget) => void;
	onSelectAnnotation: (annotationId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onCopyLink: (target: SongLinkTarget, label: string) => Promise<void>;
	requestTitleFocus?: boolean;
	onTitleFocusHandled?: () => void;
}

export function InspectorMarkerCard({
	annotation,
	isActive,
	selectedFile,
	songId,
	onOpenTarget,
	onSelectAnnotation,
	onUpdateAnnotation,
	onDeleteAnnotation,
	onCopyLink,
	requestTitleFocus = false,
	onTitleFocusHandled,
}: InspectorMarkerCardProps) {
	const cardRef = useRef<HTMLDivElement>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);
	const title = useBufferedInputValue({
		value: annotation.title,
		onCommit: (nextValue) =>
			onUpdateAnnotation(annotation.id, {
				title: nextValue,
			}),
	});
	const persistBody = useDebouncedAsyncCallback({
		callback: async (nextValue: RichTextDoc) => {
			await onUpdateAnnotation(annotation.id, {
				body: nextValue,
			});
		},
		delayMs: DEBOUNCE_MS.notes,
	});

	useLayoutEffect(() => {
		if (!requestTitleFocus || !onTitleFocusHandled) {
			return;
		}

		const card = cardRef.current;
		const input = titleInputRef.current;
		if (card) {
			card.scrollIntoView({ block: "nearest", behavior: "auto" });
		}
		if (input) {
			input.focus();
			input.select();
		}
		queueMicrotask(onTitleFocusHandled);
	}, [requestTitleFocus, onTitleFocusHandled]);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		cardRef.current?.scrollIntoView({
			block: "nearest",
			behavior: "smooth",
		});
	}, [isActive]);

	useEffect(
		() => () => {
			void persistBody.flush();
		},
		[persistBody],
	);

	const maxStartMs =
		annotation.type === "range"
			? (annotation.endMs ??
				selectedFile?.durationMs ??
				Number.MAX_SAFE_INTEGER)
			: (selectedFile?.durationMs ?? Number.MAX_SAFE_INTEGER);
	const maxEndMs = selectedFile?.durationMs ?? Number.MAX_SAFE_INTEGER;

	function activateAnnotation() {
		onSelectAnnotation(annotation.id);
		onOpenTarget(buildAnnotationTarget(songId, annotation));
	}

	function handleMarkerCardClick(event: ReactMouseEvent<HTMLDivElement>) {
		const node = event.target as HTMLElement | null;
		if (node?.closest(".marker-interactive")) {
			return;
		}

		activateAnnotation();
		event.currentTarget.blur();
	}

	return (
		/* biome-ignore lint/a11y/useSemanticElements: marker cards contain nested inputs and editors, so a semantic button wrapper is not valid */
		<div
			ref={cardRef}
			data-testid={`marker-card-${annotation.id}`}
			role="button"
			tabIndex={-1}
			aria-pressed={isActive}
			className={`marker-card text-left ${
				isActive ? "marker-card--selected" : ""
			}`}
			onClick={handleMarkerCardClick}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) {
					return;
				}

				if (event.key !== "Enter" && event.key !== " ") {
					return;
				}

				event.preventDefault();
				activateAnnotation();
			}}
		>
			<div className="marker-play-cell" aria-hidden="true" />
			<div className="marker-footer">
				<div className="marker-interactive marker-times-row">
					<MarkerTimeField
						ariaLabel="Start time"
						valueMs={annotation.startMs}
						minMs={0}
						maxMs={maxStartMs}
						onCommit={(value) =>
							void onUpdateAnnotation(annotation.id, {
								startMs: value,
							})
						}
					/>
					{annotation.type === "range" ? (
						<>
							<span
								aria-hidden="true"
								className="shrink-0 text-xs text-[var(--color-text-muted)]"
							>
								→
							</span>
							<MarkerTimeField
								ariaLabel="End time"
								valueMs={annotation.endMs ?? annotation.startMs}
								minMs={annotation.startMs}
								maxMs={maxEndMs}
								onCommit={(value) =>
									void onUpdateAnnotation(annotation.id, {
										endMs: value,
									})
								}
							/>
						</>
					) : null}
				</div>
				<div className="marker-interactive marker-actions">
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							const fileLabel = selectedFile?.title.trim() || "Untitled file";
							const markerLabel =
								annotation.title.trim() ||
								(annotation.type === "range"
									? "Untitled range"
									: "Untitled marker");
							void onCopyLink(
								buildAnnotationTarget(songId, annotation),
								`${fileLabel} - ${markerLabel}`,
							);
						}}
						className="icon-button icon-button--sm shrink-0"
						title="Copy link"
					>
						<Copy size={12} />
					</button>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							if (!window.confirm("Delete this marker?")) {
								return;
							}

							void onDeleteAnnotation(annotation.id);
						}}
						className="icon-button icon-button--sm shrink-0 text-[var(--color-danger)]"
						title="Delete annotation"
					>
						<Trash2 size={12} />
					</button>
				</div>
			</div>
			<div className="marker-interactive marker-title-row">
				<input
					ref={titleInputRef}
					value={title.draft}
					onChange={(event) => title.setDraft(event.target.value)}
					onBlur={() => void title.flush()}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.currentTarget.blur();
						}
					}}
					className="field-input field-input--compact min-w-0 flex-1"
					placeholder="Untitled marker"
					aria-label="Title"
				/>
			</div>
			<div className="marker-interactive marker-editor">
				<RichTextEditor
					value={annotation.body as RichTextDoc}
					onChange={(nextValue) => persistBody.schedule(nextValue)}
					onInternalLink={onOpenTarget}
					blurOnEscape
					seamless
					compact
					dense
					showToolbar={false}
					commitDelayMs={DEBOUNCE_MS.compactEditor}
				/>
			</div>
		</div>
	);
}

function buildAnnotationTarget(
	songId: string,
	annotation: Annotation,
): SongLinkTarget {
	return {
		songId,
		fileId: annotation.audioFileId,
		annotationId: annotation.id,
		timeMs: annotation.startMs,
		autoplay: true,
	};
}
