import { Link, useMatchRoute } from "@tanstack/react-router";
import { Library, ListMusic, Settings } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useAudioVersions } from "#/providers/audio-versions-provider";
import { useOptionalAuth } from "#/providers/auth-provider";
import { AudioVersionsSettingsDialog } from "./audio-versions-settings-dialog";
import { GlobalSearch } from "./global-search";
import { LibraryPreviewProvider } from "./library-preview-context";
import { QuickSongSwitcher } from "./quick-song-switcher";
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

function AudioVersionsChromeContent({
	children,
}: {
	children: React.ReactNode;
}) {
	const matchRoute = useMatchRoute();
	const { cloudAvailable, signOut, user } = useOptionalAuth();
	const { ready, getSongById, settings, updateUiSettings } = useAudioVersions();
	const songMatch = matchRoute({ to: "/songs/$songId" });
	const isPlaylistsRoute = Boolean(matchRoute({ to: "/playlists" }));
	const isTrashRoute = Boolean(matchRoute({ to: "/trash" }));
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
		? "audio-versions-shell audio-versions-shell--workspace"
		: "audio-versions-shell";
	const headerClassName = isSongRoute
		? "header-shell z-30 shrink-0"
		: "header-shell sticky top-0 z-30";
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	useCloseOnEscape(isSettingsOpen, () => setIsSettingsOpen(false));
	useEffect(() => {
		const handleSettingsShortcut = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.key !== ",") {
				return;
			}

			event.preventDefault();
			setIsSettingsOpen(true);
		};

		window.addEventListener("keydown", handleSettingsShortcut);
		return () => window.removeEventListener("keydown", handleSettingsShortcut);
	}, []);

	return (
		<HeaderSlotsContext.Provider
			value={{
				library: {
					enabled: !isSongRoute && !isPlaylistsRoute && !isTrashRoute,
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
					<div className="audio-versions-header-content flex w-full flex-col gap-4 px-6 py-4">
						<div className="audio-versions-header-layout">
							<nav
								aria-label="Major sections"
								className="audio-versions-header-primary flex shrink-0 items-center gap-1"
							>
								<Link
									to="/"
									aria-label={isSongRoute ? "Go to library" : "Songs"}
									title="Songs"
									className="audio-versions-header-control theme-toggle-button h-12 w-12 shrink-0 no-underline"
								>
									<Library size={19} />
								</Link>
								<Link
									to="/playlists"
									aria-label="Playlists"
									title="Playlists"
									className={`audio-versions-header-control theme-toggle-button h-12 w-12 shrink-0 no-underline ${isPlaylistsRoute ? "text-[var(--color-accent)]" : ""}`}
								>
									<ListMusic size={19} />
								</Link>
							</nav>
							{isSongRoute ? (
								<div
									ref={showSongHeaderSlot ? setSongHeaderSlot : undefined}
									className="audio-versions-header-center audio-versions-header-song min-w-0"
								/>
							) : (
								<div className="audio-versions-header-center flex min-w-0 items-center gap-3">
									<GlobalSearch />
									<div ref={setLibraryHeaderActionSlot} className="shrink-0" />
								</div>
							)}
							<div className="audio-versions-header-actions flex shrink-0 items-center justify-end gap-3">
								<button
									type="button"
									onClick={() => setIsSettingsOpen(true)}
									className="audio-versions-header-control theme-toggle-button h-12 w-12 shrink-0"
									aria-label="Open settings"
									title="Open settings"
								>
									<Settings size={18} />
								</button>
							</div>
						</div>
					</div>
				</header>

				{isSongRoute ? (
					<div
						className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
							isSettingsOpen ? "pointer-events-none" : ""
						}`}
						aria-hidden={isSettingsOpen}
					>
						{children}
					</div>
				) : (
					<div
						className={isSettingsOpen ? "pointer-events-none" : undefined}
						aria-hidden={isSettingsOpen}
					>
						{children}
					</div>
				)}

				{isSettingsOpen ? (
					<AudioVersionsSettingsDialog
						uiSettings={settings.ui}
						canSignOut={cloudAvailable && user !== null}
						userEmail={user?.email}
						onClose={() => setIsSettingsOpen(false)}
						onSignOut={signOut}
						onUpdateUiSettings={updateUiSettings}
					/>
				) : null}
				<QuickSongSwitcher />
			</div>
		</HeaderSlotsContext.Provider>
	);
}

export function AudioVersionsChrome({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<LibraryPreviewProvider>
			<AudioVersionsChromeContent>{children}</AudioVersionsChromeContent>
		</LibraryPreviewProvider>
	);
}
