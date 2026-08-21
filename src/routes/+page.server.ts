import db from "$lib/server/db";
import { get } from "$lib/server/lgtm";
import type { GhUser } from "$lib/server/model";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies }) => {
	const wkey = cookies.get("key");
	const message = cookies.get("message");

	const ghUser = wkey
		? db()
				.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
				.get(wkey)
		: null;

	return {
		message,
		wkey,
		ghLogin: ghUser?.login,
		recentImages: get(1, false, wkey),
		myImages: wkey ? get(1, true, wkey) : [],
	};
};
