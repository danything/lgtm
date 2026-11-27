import { json } from "@sveltejs/kit";

import { requireAccount } from "#lib/server/account.js";
import { moveImages } from "#lib/server/folders.js";
import { HttpError, readJson, route } from "#lib/server/http.js";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = route(async ({ request, cookies }) => {
  const userKey = requireAccount(cookies);
  const { fileNames, folderId } = await readJson(request);
  if (
    !Array.isArray(fileNames) ||
    fileNames.length === 0 ||
    !fileNames.every((n) => typeof n === "string") ||
    !(folderId === null || Number.isSafeInteger(folderId))
  )
    throw new HttpError(400, "fileNamesとfolderIdを指定してください");
  const moved = moveImages(fileNames, folderId as number | null, userKey);
  if (moved === 0) throw new HttpError(403, "移せる画像がありませんでした");
  return json({ ok: true, moved });
});
