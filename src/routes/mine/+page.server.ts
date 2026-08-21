import { redirect } from "@sveltejs/kit";
import { get } from "$lib/server/lgtm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies }) => {
	const wkey = cookies.get("key");
	// Nothing to be on this page for, and the header does not offer it either.
	if (wkey === undefined) redirect(307, "/");

	return { wkey, images: get(1, true, wkey) };
};
