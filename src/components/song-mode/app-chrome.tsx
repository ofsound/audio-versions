import { Link, useMatchRoute } from "@tanstack/react-router";
import { Library, LogOut, Settings } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useOptionalAuth } from "#/providers/auth-provider";
import { useSongMode } from "#/providers/song-mode-provider";
import { GlobalSearch } from "./global-search";
import { SongModeSettingsDialog } from "./song-mode-settings-dialog";
import { ThemeToggle } from "./theme-toggle";
import { useCloseOnEscape } from "./use-close-on-escape";

interface HeaderSlotValue {
	enabled: boolean;
	slot: HTMLDivElement | null;
}

interface HeaderSlotsContextValue {
	library: HeaderSlotValue;
	song: HeaderSlotValue;
}

export const HeaderSlotsContext = createContext<HeaderSlotsContextValue | null>(
	null,
);

export function useSongRouteHeaderSlot() {
	return useContext(HeaderSlotsContext)?.song ?? null;
}

export function useLibraryHeaderActionSlot() {
	return useContext(HeaderSlotsContext)?.library ?? null;
}

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const matchRoute = useMatchRoute();
	const { cloudAvailable, signOut, user } = useOptionalAuth();
	const { ready, getSongById, settings, updateUiSettings } = useSongMode();
	const songMatch = matchRoute({ to: "/songs/$songId" });
	const songId = songMatch ? songMatch.songId : undefined;
	const isSongRoute = Boolean(songId);
	const songTitle = songId ? getSongById(songId)?.title : undefined;
	const showSongHeaderSlot = isSongRoute && ready && songTitle !== undefined;
	const [songHeaderSlot, setSongHeaderSlot] = useState<HTMLDivElement | null>(
		null,
	);
	const [libraryHeaderActionSlot, setLibraryHeaderActionSlot] =
		useState<HTMLDivElement | null>(null);
	const shellClassName = isSongRoute
		? "song-mode-shell song-mode-shell--workspace"
		: "song-mode-shell";
	const headerClassName = isSongRoute
		? "header-shell z-30 shrink-0"
		: "header-shell sticky top-0 z-30";
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	useCloseOnEscape(isSettingsOpen, () => setIsSettingsOpen(false));

	return (
		<HeaderSlotsContext.Provider
			value={{
				library: {
					enabled: !isSongRoute,
					slot: libraryHeaderActionSlot,
				},
				song: {
					enabled: isSongRoute,
					slot: songHeaderSlot,
				},
			}}
		>
			<div className={shellClassName}>
				<header className={`${headerClassName} app-safe-area-header`}>
					<div className="flex w-full flex-col gap-4 px-3 py-4">
						<div className="flex flex-col gap-4 xl:flex-row xl:items-end">
							<div
								className={
									isSongRoute
										? "flex min-w-0 items-center gap-4 xl:shrink-0"
										: "flex min-w-0 flex-1 items-center gap-4"
								}
							>
								{isSongRoute ? (
									<Link
										to="/"
										aria-label="Go to library"
										className="theme-toggle-button h-12 w-12 shrink-0 no-underline"
									>
										<Library size={22} />
									</Link>
								) : null}

								{!isSongRoute ? (
									<div className="flex min-w-0 flex-1 items-center gap-3">
										<GlobalSearch />
										<div
											ref={setLibraryHeaderActionSlot}
											className="shrink-0"
										/>
									</div>
								) : null}
							</div>

							{showSongHeaderSlot ? (
								<div
									ref={setSongHeaderSlot}
									className="min-w-0 flex-1 xl:px-2"
								/>
							) : null}

							<div className="flex w-full min-w-0 items-center justify-end gap-3 xl:ml-auto xl:w-auto xl:shrink-0">
								{cloudAvailable && user ? (
									<button
										type="button"
										onClick={() => void signOut()}
										className="theme-toggle-button h-12 w-12 shrink-0"
										aria-label="Sign out"
										title={`Sign out ${user.email ?? ""}`.trim()}
									>
										<LogOut size={18} />
									</button>
								) : null}
								<button
									type="button"
									onClick={() => setIsSettingsOpen(true)}
									className="theme-toggle-button h-12 w-12 shrink-0"
									aria-label="Open settings"
									title="Open settings"
								>
									<Settings size={18} />
								</button>
								<ThemeToggle />
							</div>
						</div>
					</div>
				</header>

				{isSongRoute ? (
					<div
						className={`flex min-h-0 flex-1 flex-col overflow-hidden [transition:filter_200ms_ease,opacity_200ms_ease] ${
							isSettingsOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
						}`}
						aria-hidden={isSettingsOpen}
					>
						{children}
					</div>
				) : (
					<div
						className={`[transition:filter_200ms_ease,opacity_200ms_ease] ${
							isSettingsOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
						}`}
						aria-hidden={isSettingsOpen}
					>
						{children}
					</div>
				)}

				{isSettingsOpen ? (
					<SongModeSettingsDialog
						uiSettings={settings.ui}
						onClose={() => setIsSettingsOpen(false)}
						onUpdateUiSettings={updateUiSettings}
					/>
				) : null}
			</div>
		</HeaderSlotsContext.Provider>
	);
}
