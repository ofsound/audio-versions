import { LayoutGrid, List, Upload } from "lucide-react";
import type { Song, WaveformLayout } from "#/lib/song-mode/types";

interface SongWorkspaceHeaderControlsProps {
	song: Song;
	waveformLayout: WaveformLayout;
	onOpenUpload: () => void;
	onUpdateWaveformLayout: (waveformLayout: WaveformLayout) => void;
}

export function SongWorkspaceHeaderControls({
	song,
	waveformLayout,
	onOpenUpload,
	onUpdateWaveformLayout,
}: SongWorkspaceHeaderControlsProps) {
	return (
		<div className="song-workspace-header-controls flex min-w-0 flex-wrap items-end gap-x-8 gap-y-2">
			<h1 className="song-workspace-title min-w-0 break-words text-4xl font-black leading-none tracking-[-0.04em] text-[var(--color-text)] sm:text-5xl [text-shadow:0_4px_18px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]">
				{song.title}
			</h1>
			<fieldset
				className="hidden shrink-0 items-center border-0 p-0 md:flex"
				aria-label="Waveform layout"
			>
				<button
					type="button"
					aria-pressed={waveformLayout === "stacked"}
					onClick={() => onUpdateWaveformLayout("stacked")}
					className={`inline-flex h-10 items-center gap-1.5 border px-3 text-xs font-semibold ${waveformLayout === "stacked" ? "action-primary" : "action-secondary"}`}
					title="Stacked waveform lanes"
				>
					<List size={14} />
					<span className="hidden sm:inline">Stacked</span>
				</button>
				<button
					type="button"
					aria-pressed={waveformLayout === "browser"}
					onClick={() => onUpdateWaveformLayout("browser")}
					className={`-ml-px inline-flex h-10 items-center gap-1.5 border px-3 text-xs font-semibold ${waveformLayout === "browser" ? "action-primary" : "action-secondary"}`}
					title="Dense waveform browser"
				>
					<LayoutGrid size={14} />
					<span className="hidden sm:inline">Browser</span>
				</button>
			</fieldset>
			<button
				type="button"
				onClick={onOpenUpload}
				className="song-workspace-add-file action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-sm font-semibold leading-none"
			>
				<Upload size={16} />
				Add file
			</button>
		</div>
	);
}
