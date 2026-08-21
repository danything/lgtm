import { get } from "$lib/server/lgtm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies }) => {
	const wkey = cookies.get("key");

	return {
		message: cookies.get("message"),
		wkey,
		recentImages: get(1, false, wkey),
		myImages: wkey ? get(1, true, wkey) : [],
	};
};
