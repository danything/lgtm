import { redirect } from "@sveltejs/kit";
import { authorizeUrl } from "#lib/server/github.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url, cookies }) => {
	cookies.delete("message", { path: "/" });
	// SvelteKit 3 refuses to redirect off-site unless told to.
	redirect(
		302,
		authorizeUrl(`${url.origin}/api/gh/cb`, process.env.HASH ?? ""),
		{ external: true },
	);
};
