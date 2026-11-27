import type {
  Handle,
  HandleServerError,
  ServerInit,
} from "@sveltejs/kit/hooks";

import { backfillImageSizes } from "#lib/server/lgtm.js";
import { parseTheme, THEME_COOKIE, themeAttribute } from "#lib/theme.js";

// Before the first request, so no image is rendered without its size.
export const init: ServerInit = async () => {
  await backfillImageSizes();
};

// Painted in the picked theme from the first byte (app.html has the placeholder).
export const handle: Handle = ({ event, resolve }) => {
  const theme = parseTheme(event.cookies.get(THEME_COOKIE));
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%lgtm.theme%", themeAttribute(theme)),
  });
};

// error() and SvelteKit's own 404s keep their message; only bugs are logged.
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== "unknown") return;
  console.error(`${event.request.method} ${event.url.pathname}`, error);
  return { message: "サーバーでエラーが起きました" };
};
