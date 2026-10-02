import { FIRST_LIMIT } from "#lib/paging.js";
import { get } from "#lib/server/lgtm.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies }) => {
	const wkey = cookies.get("key");

	return {
		message: cookies.get("message"),
		wkey,
		images: get(0, FIRST_LIMIT, false, wkey),
	};
};
