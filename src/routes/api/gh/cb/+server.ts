import { redirect } from "@sveltejs/kit";
import db from "$lib/server/db";
import { accessToken, githubUser } from "$lib/server/github";
import { generateUniqueKey, SESSION_MAX_AGE } from "$lib/server/key";
import type { GhUser } from "$lib/server/model";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get("code");
	if (process.env.HASH !== url.searchParams.get("state") || !code) {
		cookies.set("message", "不正なリクエストです", { path: "/" });
		redirect(302, "/");
	}

	const token = await accessToken(code, `${url.origin}/api/gh/cb`);
	const user = token === undefined ? undefined : await githubUser(token);
	if (user === undefined) {
		cookies.set("message", "GitHubの認証に失敗しました", { path: "/" });
		redirect(302, "/");
	}

	// One GitHub account is one key, for good: signing in again has to land on
	// the same one or the images uploaded last time stop being yours.
	const existing = db()
		.query<GhUser, [string]>("SELECT * FROM ghUser WHERE githubId = ?")
		.get(user.id);

	let key: string;
	if (existing !== null) {
		key = existing.key;
		db().run("UPDATE ghUser SET login = ? WHERE githubId = ?", [
			user.login,
			user.id,
		]);
	} else {
		key = await generateUniqueKey(
			async (k) =>
				db()
					.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
					.get(k) !== null,
		);
		db().run("INSERT INTO ghUser (key, githubId, login) VALUES (?, ?, ?)", [
			key,
			user.id,
			user.login,
		]);
	}

	cookies.set("key", key, { path: "/", maxAge: SESSION_MAX_AGE });
	redirect(302, "/");
};
