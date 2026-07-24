import { Pause } from "lucide-react";
import { useEffect, useRef } from "react";

export function PanelResizeHandle({
	label,
	onResize,
}: {
	label: string;
	onResize: (deltaX: number) => void;
}) {
	const previousClientXRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			document.body.style.removeProperty("cursor");
			document.body.style.removeProperty("user-select");
		};
	}, []);

	function finishResize() {
		previousClientXRef.current = null;
		document.body.style.removeProperty("cursor");
		document.body.style.removeProperty("user-select");
	}

	return (
		<div className="song-workspace-panel-resizer">
			<button
				type="button"
				className="song-workspace-panel-resizer__button"
				aria-label={label}
				title={`${label}. Drag horizontally or use the arrow keys.`}
				onKeyDown={(event) => {
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
						return;
					}

					event.preventDefault();
					const direction = event.key === "ArrowLeft" ? -1 : 1;
					onResize(direction * (event.shiftKey ? 48 : 16));
				}}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					previousClientXRef.current = event.clientX;
					document.body.style.cursor = "col-resize";
					document.body.style.userSelect = "none";
				}}
				onPointerMove={(event) => {
					if (previousClientXRef.current === null) {
						return;
					}

					const deltaX = event.clientX - previousClientXRef.current;
					previousClientXRef.current = event.clientX;
					onResize(deltaX);
				}}
				onPointerUp={finishResize}
				onPointerCancel={finishResize}
			>
				<Pause aria-hidden="true" fill="currentColor" size={11} />
			</button>
		</div>
	);
}
