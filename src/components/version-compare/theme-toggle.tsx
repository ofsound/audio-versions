import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "#/providers/theme-provider";

export function ThemeToggle() {
	const { theme, toggleTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return (
			<div
				className="version-compare-header-control h-12 w-12 shrink-0"
				aria-hidden="true"
			/>
		);
	}

	const nextLabel =
		theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

	return (
		<button
			type="button"
			onClick={toggleTheme}
			className="version-compare-header-control theme-toggle-button h-12 w-12 shrink-0"
			aria-label={nextLabel}
			title={nextLabel}
		>
			{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
		</button>
	);
}
