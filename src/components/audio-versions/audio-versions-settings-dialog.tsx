import { LogOut, Moon, Sun } from "lucide-react";
import { type RefObject, useRef } from "react";
import type {
	AudioVersionsUiSettings,
	WaveformHeightPreset,
} from "#/lib/audio-versions/types";
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

const WAVEFORM_OPTIONS: Array<{
	label: string;
	value: WaveformHeightPreset;
}> = [
	{ label: "Large", value: "large" },
	{ label: "Medium", value: "medium" },
	{ label: "Small", value: "small" },
];

export function AudioVersionsSettingsDialog({
	uiSettings,
	canSignOut,
	userEmail,
	onClose,
	onSignOut,
	onUpdateUiSettings,
}: AudioVersionsSettingsDialogProps) {
	const firstColorInputRef = useRef<HTMLInputElement | null>(null);
	const { theme, toggleTheme } = useTheme();
	const nextTheme = theme === "dark" ? "light" : "dark";

	return (
		<SongModal
			title="Settings"
			titleId="settings-title"
			onClose={onClose}
			initialFocusRef={firstColorInputRef}
		>
			<div className="grid gap-8 p-5 sm:p-6">
				<section className="grid gap-4">
					<div>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							App
						</h3>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div className="border border-[var(--color-border-plain)] bg-[var(--color-surface-elevated)] px-4 py-4">
							<div className="flex items-center justify-between gap-4">
								<div>
									<div className="text-sm font-semibold text-[var(--color-text)]">
										Color theme
									</div>
									<div className="mt-1 text-sm text-[var(--color-text-muted)]">
										Currently using {theme} mode
									</div>
								</div>
								<button
									type="button"
									onClick={toggleTheme}
									aria-label={`Switch to ${nextTheme} mode`}
									className="action-secondary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold"
								>
									{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
									{nextTheme === "light" ? "Light" : "Dark"}
								</button>
							</div>
						</div>

						{canSignOut ? (
							<div className="border border-[var(--color-border-plain)] bg-[var(--color-surface-elevated)] px-4 py-4">
								<div className="flex items-center justify-between gap-4">
									<div className="min-w-0">
										<div className="text-sm font-semibold text-[var(--color-text)]">
											Account
										</div>
										{userEmail ? (
											<div className="mt-1 truncate text-sm text-[var(--color-text-muted)]">
												{userEmail}
											</div>
										) : null}
									</div>
									<button
										type="button"
										onClick={() => void onSignOut()}
										aria-label={
											userEmail ? `Sign out ${userEmail}` : "Sign out"
										}
										className="action-secondary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold"
									>
										<LogOut size={18} />
										Sign out
									</button>
								</div>
							</div>
						) : null}
					</div>
				</section>

				<section className="grid gap-4">
					<div>
						<p className="eyebrow mb-2">Appearance</p>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							Accent colors
						</h3>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						{theme === "light" ? (
							<ColorSettingField
								label="Light accent"
								value={uiSettings.accentLightPrimary}
								onChange={(value) =>
									void onUpdateUiSettings({ accentLightPrimary: value })
								}
								inputRef={firstColorInputRef}
							/>
						) : (
							<ColorSettingField
								label="Dark accent"
								value={uiSettings.accentDarkPrimary}
								onChange={(value) =>
									void onUpdateUiSettings({ accentDarkPrimary: value })
								}
								inputRef={firstColorInputRef}
							/>
						)}
						<ColorSettingField
							label="Dark primary"
							value={uiSettings.accentDarkPrimary}
							onChange={(value) =>
								void onUpdateUiSettings({ accentDarkPrimary: value })
							}
						/>
					</div>
				</section>

				<section className="grid gap-4">
					<div>
						<p className="eyebrow mb-2">Workspace</p>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							Waveform height
						</h3>
					</div>
					<div className="flex flex-wrap gap-2">
						{WAVEFORM_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								aria-pressed={uiSettings.waveformHeight === option.value}
								onClick={() =>
									void onUpdateUiSettings({
										waveformHeight: option.value,
									})
								}
								className={`inline-flex h-11 items-center justify-center px-4 text-sm font-semibold ${
									uiSettings.waveformHeight === option.value
										? "action-primary"
										: "action-secondary"
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</section>

				<section className="grid gap-4">
					<div>
						<p className="eyebrow mb-2">Metadata</p>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							Visible song fields
						</h3>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<ToggleSettingCard
							label="Artist"
							enabled={uiSettings.showArtist}
							onToggle={() =>
								void onUpdateUiSettings((current) => ({
									...current,
									showArtist: !current.showArtist,
								}))
							}
						/>
						<ToggleSettingCard
							label="Project"
							enabled={uiSettings.showProject}
							onToggle={() =>
								void onUpdateUiSettings((current) => ({
									...current,
									showProject: !current.showProject,
								}))
							}
						/>
					</div>
				</section>

				<section className="grid gap-4">
					<div>
						<p className="eyebrow mb-2">Accessibility</p>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							Keyboard focus highlights
						</h3>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<ToggleSettingCard
							label="Show focus rings"
							enabled={uiSettings.keyboardFocusHighlights}
							detailWhenOn="Focused controls show a ring when using the keyboard."
							detailWhenOff="Keyboard focus rings are hidden; pointer use is unchanged."
							onToggle={() =>
								void onUpdateUiSettings((current) => ({
									...current,
									keyboardFocusHighlights: !current.keyboardFocusHighlights,
								}))
							}
						/>
					</div>
				</section>
			</div>
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
	onChange: (value: string) => void;
	inputRef?: RefObject<HTMLInputElement | null>;
}) {
	const bufferedValue = useBufferedInputValue({
		value,
		onCommit: onChange,
		delayMs: 400,
	});

	return (
		<label className="grid gap-2">
			<span className="field-label">{label}</span>
			<div className="flex h-12 items-center gap-3 border border-[var(--color-border-plain)] bg-[var(--color-surface-elevated)] px-3 py-0 text-[var(--color-text)]">
				<input
					ref={inputRef}
					type="color"
					value={bufferedValue.draft}
					onChange={(event) => bufferedValue.setDraft(event.target.value)}
					onBlur={() => void bufferedValue.flush()}
					aria-label={label}
					className="h-7 w-9 shrink-0 cursor-pointer border-0 bg-transparent p-0"
				/>
				<span className="text-sm font-semibold uppercase text-[var(--color-text)]">
					{bufferedValue.draft}
				</span>
			</div>
		</label>
	);
}

function ToggleSettingCard({
	label,
	enabled,
	onToggle,
	detailWhenOn = "Visible across the UI",
	detailWhenOff = "Hidden until re-enabled",
}: {
	label: string;
	enabled: boolean;
	onToggle: () => void;
	detailWhenOn?: string;
	detailWhenOff?: string;
}) {
	return (
		<div className="border border-[var(--color-border-plain)] bg-[var(--color-surface-elevated)] px-4 py-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="text-sm font-semibold text-[var(--color-text)]">
						{label}
					</div>
					<div className="mt-1 text-sm text-[var(--color-text-muted)]">
						{enabled ? detailWhenOn : detailWhenOff}
					</div>
				</div>
				<button
					type="button"
					aria-pressed={enabled}
					onClick={onToggle}
					className={`inline-flex h-11 items-center justify-center px-4 text-sm font-semibold ${
						enabled ? "action-primary" : "action-secondary"
					}`}
				>
					{enabled ? "Shown" : "Hidden"}
				</button>
			</div>
		</div>
	);
}
