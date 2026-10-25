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
							<fieldset
								aria-label="Color theme"
								className="grid h-14 w-64 grid-cols-2 border border-[var(--color-border-plain)] bg-[var(--color-surface)] p-1"
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
										className={`inline-flex items-center justify-center gap-2 text-base font-semibold ${theme === value ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)]"}`}
									>
										<Icon size={18} />
										{label}
									</button>
								))}
							</fieldset>
						</div>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						{theme === "light" ? (
							<ColorSettingField
								key="light"
								label="Light accent"
								value={uiSettings.accentLightPrimary}
								onChange={(value) =>
									onUpdateUiSettings({ accentLightPrimary: value })
								}
								inputRef={firstColorInputRef}
							/>
						) : (
							<ColorSettingField
								key="dark"
								label="Dark accent"
								value={uiSettings.accentDarkPrimary}
								onChange={(value) =>
									onUpdateUiSettings({ accentDarkPrimary: value })
								}
								inputRef={firstColorInputRef}
							/>
						)}
					</div>
				</section>

				<section className="grid gap-6">
					<ToggleSettingCard
						label="Song Notes First"
						enabled={uiSettings.songNotesFirst}
						enabledLabel="On"
						disabledLabel="Off"
						onChange={(enabled) =>
							void onUpdateUiSettings({ songNotesFirst: enabled })
						}
					/>
					<ToggleSettingCard
						label="Artist"
						enabled={uiSettings.showArtist}
						onChange={(enabled) =>
							void onUpdateUiSettings({ showArtist: enabled })
						}
					/>
					<ToggleSettingCard
						label="Project"
						enabled={uiSettings.showProject}
						onChange={(enabled) =>
							void onUpdateUiSettings({ showProject: enabled })
						}
					/>
					<ToggleSettingCard
						label="Focus Rings"
						enabled={uiSettings.keyboardFocusHighlights}
						onChange={(enabled) =>
							void onUpdateUiSettings({ keyboardFocusHighlights: enabled })
						}
					/>
				</section>

				<section className="border-t border-[var(--color-border-plain)] pt-6">
					<Link
						to="/trash"
						onClick={onClose}
						className="action-secondary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold no-underline"
					>
						<Trash2 size={18} />
						Open Trash
					</Link>
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
	onChange: (value: string) => Promise<void> | void;
	inputRef?: RefObject<HTMLInputElement | null>;
}) {
	const bufferedValue = useBufferedInputValue({
		value,
		onCommit: onChange,
		delayMs: 400,
	});

	return (
		<label className="grid gap-2">
			<span className="text-sm font-semibold text-[var(--color-text)]">
				{label}
			</span>
			<div className="flex h-12 items-center gap-3 text-[var(--color-text)]">
				<input
					ref={inputRef}
					type="color"
					value={bufferedValue.draft}
					onChange={(event) => bufferedValue.setDraft(event.target.value)}
					onBlur={() => void bufferedValue.flush()}
					aria-label={label}
					className="h-11 w-16 shrink-0 cursor-pointer border-0 bg-transparent p-0"
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
	onChange,
	enabledLabel = "Show",
	disabledLabel = "Hide",
}: {
	label: string;
	enabled: boolean;
	onChange: (enabled: boolean) => void;
	enabledLabel?: string;
	disabledLabel?: string;
}) {
	return (
		<div className="grid justify-items-start gap-2 py-2">
			<div className="text-sm font-semibold text-[var(--color-text)]">
				{label}
			</div>
			<fieldset
				aria-label={label}
				className="grid h-8 w-[9.25rem] grid-cols-2 border border-[var(--color-border-plain)] bg-[var(--color-surface)] p-0.5 text-xs font-semibold"
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
								? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
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
