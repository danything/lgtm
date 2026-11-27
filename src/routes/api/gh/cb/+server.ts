import { redirect } from "@sveltejs/kit";

import { findAccount } from "#lib/server/account.js";
import db from "#lib/server/db.js";
import { accessToken, githubUser } from "#lib/server/github.js";
import { generateUniqueKey, SESSION_MAX_AGE } from "#lib/server/key.js";
import type { GhUser } from "#lib/server/model.js";

import type { RequestHandler } from "./$types";

function failed(
  cookies: Parameters<RequestHandler>[0]["cookies"],
  message: string,
): never {
  cookies.set("message", message, { path: "/" });
  redirect(302, "/");
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  if (process.env.HASH !== url.searchParams.get("state") || !code)
    failed(cookies, "不正なリクエストです");

  const token = await accessToken(code, `${url.origin}/api/gh/cb`).catch((e) =>
    console.error("GitHub token exchange failed", e),
  );
  const user = token
    ? await githubUser(token).catch((e) =>
        console.error("GitHub user lookup failed", e),
      )
    : undefined;
  if (!user) failed(cookies, "GitHubの認証に失敗しました");

  // One GitHub account keeps one key, or last time's images stop being yours.
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
    key = await generateUniqueKey(async (k) => findAccount(k) !== null);
    db().run("INSERT INTO ghUser (key, githubId, login) VALUES (?, ?, ?)", [
      key,
      user.id,
      user.login,
    ]);
  }

  cookies.set("key", key, { path: "/", maxAge: SESSION_MAX_AGE });
  redirect(302, "/");
};
