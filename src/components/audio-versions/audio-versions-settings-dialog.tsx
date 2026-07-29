import { LogOut, Moon, Sun } from "lucide-react";
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
	const { theme, toggleTheme } = useTheme();

	return (
		<SongModal
			title="Settings"
			titleId="settings-title"
			onClose={onClose}
			initialFocusRef={firstColorInputRef}
		>
			<div className="grid gap-8 p-5 sm:p-6">
				<section className="grid gap-4">
					{canSignOut ? (
						<div className="py-2">
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
									aria-label={userEmail ? `Sign out ${userEmail}` : "Sign out"}
									className="action-secondary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold"
								>
									<LogOut size={18} />
									Sign out
								</button>
							</div>
						</div>
					) : null}
				</section>

				<section className="grid gap-4">
					<div className="py-2">
						<div className="grid justify-items-start gap-3">
							<div>
								<div className="text-sm font-semibold text-[var(--color-text)]">
									Color theme
								</div>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={theme === "dark"}
								onClick={toggleTheme}
								aria-label="Color theme"
								className="relative grid h-14 w-64 grid-cols-2 overflow-hidden border border-[var(--color-border-plain)] bg-[var(--color-surface)] text-base font-semibold"
							>
								<span
									aria-hidden="true"
									className={`absolute inset-y-1 left-1 w-[calc(50%-0.5rem)] bg-[var(--color-accent)] transition-transform ${
										theme === "dark" ? "translate-x-[calc(100%+0.5rem)]" : ""
									}`}
								/>
								<span
									className={`relative z-10 inline-flex items-center justify-center gap-2 ${
										theme === "light"
											? "text-[var(--color-on-accent)]"
											: "text-[var(--color-text-muted)]"
									}`}
								>
									<Sun size={18} />
									Light
								</span>
								<span
									className={`relative z-10 inline-flex items-center justify-center gap-2 ${
										theme === "dark"
											? "text-[var(--color-on-accent)]"
											: "text-[var(--color-text-muted)]"
									}`}
								>
									<Moon size={18} />
									Dark
								</span>
							</button>
						</div>
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
					</div>
				</section>

				<section className="grid gap-6">
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
					<ToggleSettingCard
						label="Focus Rings"
						enabled={uiSettings.keyboardFocusHighlights}
						onToggle={() =>
							void onUpdateUiSettings((current) => ({
								...current,
								keyboardFocusHighlights: !current.keyboardFocusHighlights,
							}))
						}
					/>
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
			<div className="flex h-12 items-center gap-3 text-[var(--color-text)]">
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
}: {
	label: string;
	enabled: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="grid justify-items-start gap-2 py-2">
			<div className="text-sm font-semibold text-[var(--color-text)]">
				{label}
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={enabled}
				aria-label={label}
				onClick={onToggle}
				className="relative grid h-8 w-[9.25rem] grid-cols-2 overflow-hidden border border-[var(--color-border-plain)] bg-[var(--color-surface)] text-xs font-semibold"
			>
				<span
					aria-hidden="true"
					className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.25rem)] bg-[var(--color-accent)] transition-transform ${
						enabled ? "" : "translate-x-[calc(100%+0.25rem)]"
					}`}
				/>
				<span
					className={`relative z-10 inline-flex items-center justify-center ${
						enabled
							? "text-[var(--color-on-accent)]"
							: "text-[var(--color-text-muted)]"
					}`}
				>
					Show
				</span>
				<span
					className={`relative z-10 inline-flex items-center justify-center ${
						enabled
							? "text-[var(--color-text-muted)]"
							: "text-[var(--color-on-accent)]"
					}`}
				>
					Hide
				</span>
			</button>
		</div>
	);
}
