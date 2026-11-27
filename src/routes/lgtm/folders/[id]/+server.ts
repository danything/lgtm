import { json } from "@sveltejs/kit";

import { parseFolder } from "#lib/folders.js";
import { requireAccount } from "#lib/server/account.js";
import { deleteFolder, renameFolder } from "#lib/server/folders.js";
import { HttpError, readJson, route } from "#lib/server/http.js";

import type { RequestHandler } from "./$types";

function folderId(param: string): number {
  const id = parseFolder(param);
  if (typeof id !== "number")
    throw new HttpError(404, "フォルダが見つかりません");
  return id;
}

export const PATCH: RequestHandler = route(
  async ({ request, cookies, params }) => {
    const userKey = requireAccount(cookies);
    const { name } = await readJson(request);
    renameFolder(folderId(params.id), userKey, name);
    return json({ ok: true });
  },
);

export const DELETE: RequestHandler = route(({ cookies, params }) => {
  const userKey = requireAccount(cookies);
  return json({ ok: true, moved: deleteFolder(folderId(params.id), userKey) });
});
