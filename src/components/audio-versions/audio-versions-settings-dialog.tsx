import { Link } from "@tanstack/react-router";
import { LogOut, Moon, Sun, Trash2 } from "lucide-react";
import { type RefObject, useRef } from "react";
import type { AudioVersionsUiSettings } from "#/lib/audio-versions/types";
import { useTheme } from "#/providers/theme-provider";
import { SongModal } from "./song-modal";
import { useBufferedInputValue } from "./use-buffered-input-value";

interface AudioVersionsSettingsDialogProps {
	uiSettings: AudioVersionsUiSettings;
	canSignOut: boolean;
	userEmail?: string;
	onClose: () => void;
	onSignOut: () => Promise<void>;
	onUpdateUiSettings: (
		patch:
			| Partial<AudioVersionsUiSettings>
			| ((current: AudioVersionsUiSettings) => AudioVersionsUiSettings),
	) => Promise<void>;
}

export function AudioVersionsSettingsDialog({
	uiSettings,
	canSignOut,
	userEmail,
	onClose,
	onSignOut,
	onUpdateUiSettings,
}: AudioVersionsSettingsDialogProps) {
	const firstColorInputRef = useRef<HTMLInputElement | null>(null);
	const { theme, setTheme } = useTheme();

	return (
		<SongModal
			title="Settings"
			titleId="settings-title"
			onClose={onClose}
			initialFocusRef={firstColorInputRef}
			panelClassName="w-[calc(100vw-2rem)] max-w-[58rem]"
		>
			<div className="grid md:grid-cols-2">
				<section
					aria-labelledby="settings-appearance"
					className="min-w-0 px-5 py-5 sm:px-6"
				>
					<h3
						id="settings-appearance"
						className="mb-2 text-lg font-semibold text-[var(--color-text)]"
					>
						Appearance
					</h3>
					<div className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--color-border-plain)] py-4">
						<div className="text-sm font-medium text-[var(--color-text)]">
							Color theme
						</div>
						<fieldset
							aria-label="Color theme"
							className="grid h-9 w-36 shrink-0 grid-cols-2 border border-[var(--color-border-plain)] bg-[var(--color-surface)] p-0.5 text-sm font-medium"
						>
							{(
								[
									{ value: "light", label: "Light", Icon: Sun },
									{ value: "dark", label: "Dark", Icon: Moon },
								] as const
							).map(({ value, label, Icon }) => (
								<button
									key={value}
									type="button"
									aria-pressed={theme === value}
									onClick={() => setTheme(value)}
									className={`inline-flex items-center justify-center gap-1.5 ${theme === value ? "bg-[var(--color-accent-surface)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}
								>
									<Icon size={14} />
									{label}
								</button>
							))}
						</fieldset>
					</div>
					<ColorSettingField
						key={theme}
						label={theme === "light" ? "Light accent" : "Dark accent"}
						value={
							theme === "light"
								? uiSettings.accentLightPrimary
								: uiSettings.accentDarkPrimary
						}
						onChange={(value) =>
							onUpdateUiSettings(
								theme === "light"
									? { accentLightPrimary: value }
									: { accentDarkPrimary: value },
							)
						}
						inputRef={firstColorInputRef}
					/>
					<ToggleSettingRow
						label="Focus Rings"
						description="Highlight controls when using the keyboard."
						enabled={uiSettings.keyboardFocusHighlights}
						onChange={(enabled) =>
							void onUpdateUiSettings({ keyboardFocusHighlights: enabled })
						}
					/>
				</section>
				<section
					aria-labelledby="settings-workspace"
					className="min-w-0 border-t border-[var(--color-border-plain)] px-5 py-5 sm:px-6 md:border-t-0 md:border-l"
				>
					<h3
						id="settings-workspace"
						className="mb-2 text-lg font-semibold text-[var(--color-text)]"
					>
						Workspace
					</h3>
					<ToggleSettingRow
						label="Song Notes First"
						description="Place song notes in the left column."
						enabled={uiSettings.songNotesFirst}
						enabledLabel="On"
						disabledLabel="Off"
						onChange={(enabled) =>
							void onUpdateUiSettings({ songNotesFirst: enabled })
						}
					/>
					<ToggleSettingRow
						label="Artist"
						description="Show artist fields and the library column."
						enabled={uiSettings.showArtist}
						onChange={(enabled) =>
							void onUpdateUiSettings({ showArtist: enabled })
						}
					/>
					<ToggleSettingRow
						label="Project"
						description="Show project fields in song settings."
						enabled={uiSettings.showProject}
						onChange={(enabled) =>
							void onUpdateUiSettings({ showProject: enabled })
						}
					/>
				</section>
			</div>
			<footer className="flex flex-col gap-4 border-t border-[var(--color-border-plain)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="min-w-0">
					<div className="text-sm font-medium text-[var(--color-text)]">
						{canSignOut ? "Account" : "Local library"}
					</div>
					<p
						className="mt-1 truncate text-sm text-[var(--color-text-muted)]"
						title={userEmail}
					>
						{canSignOut ? userEmail : "Stored on this device"}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					<Link
						to="/trash"
						onClick={onClose}
						className="action-secondary inline-flex h-10 items-center justify-center gap-2 px-3 text-sm font-medium no-underline"
					>
						<Trash2 size={15} />
						Open Trash
					</Link>
					{canSignOut && (
						<button
							type="button"
							onClick={() => void onSignOut()}
							aria-label={userEmail ? `Sign out ${userEmail}` : "Sign out"}
							className="action-secondary inline-flex h-10 items-center justify-center gap-2 px-3 text-sm font-medium"
						>
							<LogOut size={15} />
							Sign out
						</button>
					)}
				</div>
			</footer>
		</SongModal>
	);
}

function ColorSettingField({
	label,
	value,
	onChange,
	inputRef,
}: {
	label: string;
	value: string;
	onChange: (value: string) => Promise<void> | void;
	inputRef?: RefObject<HTMLInputElement | null>;
}) {
	const bufferedValue = useBufferedInputValue({
		value,
		onCommit: onChange,
		delayMs: 400,
	});

	return (
		<label className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--color-border-plain)] py-4">
			<span className="text-sm font-medium text-[var(--color-text)]">
				{label}
			</span>
			<div className="flex h-9 w-36 items-center gap-2 border border-[var(--color-border-plain)] bg-[var(--color-surface)] px-1.5 text-[var(--color-text)]">
				<input
					ref={inputRef}
					type="color"
					value={bufferedValue.draft}
					onChange={(event) => bufferedValue.setDraft(event.target.value)}
					onBlur={() => void bufferedValue.flush()}
					aria-label={label}
					className="h-7 w-9 shrink-0 cursor-pointer border-0 bg-transparent p-0"
				/>
				<span className="font-mono text-xs uppercase text-[var(--color-text)]">
					{bufferedValue.draft}
				</span>
			</div>
		</label>
	);
}

function ToggleSettingRow({
	label,
	description,
	enabled,
	onChange,
	enabledLabel = "Show",
	disabledLabel = "Hide",
}: {
	label: string;
	description: string;
	enabled: boolean;
	onChange: (enabled: boolean) => void;
	enabledLabel?: string;
	disabledLabel?: string;
}) {
	return (
		<div className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--color-border-plain)] py-4 last:border-b-0">
			<div className="min-w-0">
				<div className="text-sm font-medium text-[var(--color-text)]">
					{label}
				</div>
				<p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
					{description}
				</p>
			</div>
			<fieldset
				aria-label={label}
				className="grid h-9 w-36 shrink-0 grid-cols-2 border border-[var(--color-border-plain)] bg-[var(--color-surface)] p-0.5 text-sm font-medium"
			>
				{[
					{ value: true, label: enabledLabel },
					{ value: false, label: disabledLabel },
				].map((option) => (
					<button
						key={option.label}
						type="button"
						aria-pressed={enabled === option.value}
						onClick={() => onChange(option.value)}
						className={
							enabled === option.value
								? "bg-[var(--color-accent-surface)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-accent)]"
								: "text-[var(--color-text-muted)]"
						}
					>
						{option.label}
					</button>
				))}
			</fieldset>
		</div>
	);
}
