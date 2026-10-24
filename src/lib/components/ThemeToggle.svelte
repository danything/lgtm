<script lang="ts">
import { untrack } from "svelte";
import { THEME_COOKIE, type Theme } from "#lib/theme.js";

let { initial }: { initial: Theme } = $props();

// Seeded from the cookie the server read; from here on this button owns it,
// so only the first value is wanted (untrack says that is the point).
let theme = $state<Theme>(untrack(() => initial));

const NEXT: Record<Theme, Theme> = {
	system: "light",
	light: "dark",
	dark: "system",
};
const NAME: Record<Theme, string> = {
	system: "OSに合わせる",
	light: "ライト",
	dark: "ダーク",
};

function apply(next: Theme) {
	theme = next;
	const root = document.documentElement;
	if (next === "system") root.removeAttribute("data-theme");
	else root.setAttribute("data-theme", next);
	// A year, for the whole site. Lax: it only decides colours.
	// biome-ignore lint/suspicious/noDocumentCookie: the value is one of three fixed words, so there is nothing to escape, and the Cookie Store API is not in every browser this site serves
	document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

// Only switches the attribute; the colours ease over by CSS transitions on
// the page and the header (app.css, +layout.svelte), not by script.
const onclick = () => apply(NEXT[theme]);
</script>

<button
	type="button"
	class="icon"
	aria-label={`テーマ: ${NAME[theme]}（押すと${NAME[NEXT[theme]]}）`}
	title={`テーマ: ${NAME[theme]}`}
	{onclick}
>
	{#key theme}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{#if theme === "light"}
				<circle cx="12" cy="12" r="4" />
				<path
					d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
				/>
			{:else if theme === "dark"}
				<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
			{:else}
				<rect x="3" y="4" width="18" height="12" rx="2" />
				<path d="M8 20h8M12 16v4" />
			{/if}
		</svg>
	{/key}
</button>

<style>
svg {
	width: 1.25rem;
	height: 1.25rem;
	/* 切り替えたら印が回りながら入れ替わる */
	animation: theme-spin 320ms var(--ui-ease-out) both;
}
@keyframes theme-spin {
	from {
		opacity: 0;
		transform: rotate(-90deg) scale(0.6);
	}
}
</style>
