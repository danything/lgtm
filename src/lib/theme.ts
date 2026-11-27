/** "system" follows the OS. A cookie, so the server paints <html> in it from the start. */
export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE = "theme";

export const parseTheme = (value: string | undefined): Theme =>
  value === "light" || value === "dark" ? value : "system";

/** The attribute text for <html>: none for "system", so Pico's auto rules apply. */
export const themeAttribute = (theme: Theme) =>
  theme === "system" ? "" : ` data-theme="${theme}"`;
