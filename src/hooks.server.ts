import type { ServerInit } from "@sveltejs/kit";
import { backfillImageSizes } from "$lib/server/lgtm";

// Runs once before the first request is served, so the gallery never renders
// a stored image without its size.
export const init: ServerInit = async () => {
	await backfillImageSizes();
};
