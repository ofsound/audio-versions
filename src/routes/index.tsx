import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "#/components/version-compare/library-view";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return <LibraryView />;
}
