import { json } from "@sveltejs/kit";

import { requireAccount } from "#lib/server/account.js";
import { HttpError, readJson, route } from "#lib/server/http.js";
import { deleteFile } from "#lib/server/lgtm.js";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = route(async ({ request, cookies }) => {
  const userKey = requireAccount(cookies);
  const { fileName } = await readJson(request);
  if (typeof fileName !== "string")
    throw new HttpError(400, "fileNameを指定してください");
  if (!deleteFile(fileName, userKey))
    throw new HttpError(
      403,
      "この画像は削除できません (自分の画像ではないか、削除済みです)",
    );
  return json({ ok: true });
});
