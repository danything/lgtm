import { isAdmin } from "$lib/server/admin";
import db from "$lib/server/db";
import type { GhUser } from "$lib/server/model";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies }) => {
	const key = cookies.get("key");
	// The header carries both the sign-in state and the upload control now, so
	// it needs to know who this is on every page, not just the gallery.
	const ghUser = key
		? db()
				.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
				.get(key)
		: null;

	return { isAdmin: isAdmin(key), ghLogin: ghUser?.login };
};
