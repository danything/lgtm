import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { backfillImageSizes } from "#lib/server/lgtm.js";
import { parseTheme, THEME_COOKIE, themeAttribute } from "#lib/theme.js";

// Runs once before the first request is served, so the gallery never renders
// a stored image without its size.
export const init: ServerInit = async () => {
	await backfillImageSizes();
};

// The theme someone picked goes onto <html> in the very first response, so
// the page is painted in it from the start (app.html leaves the placeholder).
export const handle: Handle = ({ event, resolve }) => {
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace("%lgtm.theme%", themeAttribute(theme)),
	});
};
