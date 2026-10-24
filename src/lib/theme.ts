/**
 * The colour theme someone picked. "system" follows the OS and is the default;
 * the other two pin it. Kept in a cookie rather than localStorage so the
 * server can put it on <html> in the first response (hooks.server.ts) -- the
 * page never paints in the wrong theme and then flips.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE = "theme";

export const parseTheme = (value: string | undefined): Theme =>
	value === "light" || value === "dark" ? value : "system";

/** The attribute text for <html>: none for "system", so Pico's auto rules apply. */
export const themeAttribute = (theme: Theme) =>
	theme === "system" ? "" : ` data-theme="${theme}"`;
