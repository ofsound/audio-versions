import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	clampLibraryColumnWidth,
	LIBRARY_COLUMNS,
	type LibraryColumnKey,
	type LibraryColumnWidths,
} from "#/lib/audio-versions/library-columns";

export function useLibraryColumnResize(
	table: RefObject<HTMLTableElement | null>,
	saved: LibraryColumnWidths | undefined,
	onChange: (widths: LibraryColumnWidths) => void,
) {
	const [preview, setPreview] = useState<LibraryColumnWidths | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const drag = useRef<{
		key: LibraryColumnKey;
		pointerId: number;
		x: number;
		base: LibraryColumnWidths;
		latest: LibraryColumnWidths;
		element: HTMLButtonElement;
		cursor: string;
		userSelect: string;
	} | null>(null);
	const widths = preview ?? saved ?? {};
	useEffect(() => {
		if (
			!drag.current &&
			preview &&
			Object.entries(preview).every(
				([key, value]) => saved?.[key as LibraryColumnKey] === value,
			)
		)
			setPreview(null);
	}, [preview, saved]);
	const finish = useCallback((commit: boolean) => {
		const current = drag.current;
		if (!current) return;
		drag.current = null;
		document.body.style.cursor = current.cursor;
		document.body.style.userSelect = current.userSelect;
		if (current.element.hasPointerCapture?.(current.pointerId))
			current.element.releasePointerCapture(current.pointerId);
		if (commit && current.latest[current.key] !== current.base[current.key])
			onChangeRef.current(current.latest);
		else setPreview(null);
	}, []);
	useEffect(() => {
		const blur = () => finish(true);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("blur", blur);
			finish(false);
		};
	}, [finish]);
	const captureWidths = () => {
		const base: LibraryColumnWidths = { ...widths };
		for (const th of table.current?.querySelectorAll<HTMLElement>(
			"th[data-column-key]",
		) ?? []) {
			const key = th.dataset.columnKey as LibraryColumnKey;
			base[key] = clampLibraryColumnWidth(
				key,
				th.getBoundingClientRect().width ||
					widths[key] ||
					LIBRARY_COLUMNS[key].width,
			);
		}
		return base;
	};
	const setWidth = (key: LibraryColumnKey, width: number) => {
		const next = {
			...captureWidths(),
			[key]: clampLibraryColumnWidth(key, width),
		};
		setPreview(next);
		onChangeRef.current(next);
	};
	const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const current = drag.current;
		if (!current || event.pointerId !== current.pointerId) return;
		current.latest = {
			...current.base,
			[current.key]: clampLibraryColumnWidth(
				current.key,
				(current.base[current.key] ?? LIBRARY_COLUMNS[current.key].width) +
					event.clientX -
					current.x,
			),
		};
		setPreview(current.latest);
	};
	return {
		widths,
		setWidth,
		handleProps: (key: LibraryColumnKey) => ({
			onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
				if (event.button !== 0 || drag.current) return;
				event.preventDefault();
				event.stopPropagation();
				const base = captureWidths();
				drag.current = {
					key,
					pointerId: event.pointerId,
					x: event.clientX,
					base,
					latest: base,
					element: event.currentTarget,
					cursor: document.body.style.cursor,
					userSelect: document.body.style.userSelect,
				};
				event.currentTarget.focus({ preventScroll: true });
				event.currentTarget.setPointerCapture?.(event.pointerId);
				document.body.style.cursor = "col-resize";
				document.body.style.userSelect = "none";
				setPreview(base);
			},
			onPointerMove: move,
			onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
				if (drag.current?.pointerId !== event.pointerId) return;
				move(event);
				finish(true);
			},
			onPointerCancel: () => finish(false),
			onLostPointerCapture: () => finish(true),
		}),
	};
}
