import { redirect } from "@sveltejs/kit";
import { authorizeUrl } from "$lib/server/github";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url, cookies }) => {
	cookies.delete("message", { path: "/" });
	redirect(
		302,
		authorizeUrl(`${url.origin}/api/gh/cb`, process.env.HASH ?? ""),
	);
};
