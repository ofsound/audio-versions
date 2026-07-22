import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "#/components/audio-versions/library-view";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return <LibraryView />;
}
