import { json } from "@sveltejs/kit";
import { get } from "$lib/server/lgtm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const page = Number(url.searchParams.get("page") ?? "1");
	const find = url.searchParams.get("find") === "true";
	const userKey = cookies.get("key");
	return json(get(page, find, userKey));
};
