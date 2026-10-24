import { createFileRoute } from "@tanstack/react-router";
import { PlaylistsView } from "#/components/audio-versions/playlists-view";

export const Route = createFileRoute("/playlists")({
	component: PlaylistsView,
});
