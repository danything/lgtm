import { json } from "@sveltejs/kit";
import { PER_PAGE } from "$lib/paging";
import { get } from "$lib/server/lgtm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const offset = Math.max(
		0,
		Math.floor(Number(url.searchParams.get("offset")) || 0),
	);
	// Capped so a hand-written URL cannot ask for the whole table at once.
	const limit = Math.min(
		PER_PAGE,
		Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || PER_PAGE)),
	);
	const find = url.searchParams.get("find") === "true";
	const userKey = cookies.get("key");
	return json(get(offset, limit, find, userKey));
};
