import { useAudioVersions } from "./audio-versions-provider";

/** Do not expose default settings, empty states or actions before hydration. */
export function AudioVersionsReadyBoundary({
	children,
}: {
	children: React.ReactNode;
}) {
	const { ready } = useAudioVersions();
	if (!ready)
		return (
			<output className="flex min-h-dvh items-center justify-center text-sm text-[var(--color-text-muted)]">
				Loading Audio Versions…
			</output>
		);
	return children;
}
