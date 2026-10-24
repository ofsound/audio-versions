import { createFileRoute } from "@tanstack/react-router";
import { TrashView } from "#/components/audio-versions/trash-view";

export const Route = createFileRoute("/trash")({
	component: TrashView,
});
