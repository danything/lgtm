import { json } from "@sveltejs/kit";

import { deleteUser, isAdmin, setAdmin } from "#lib/server/admin.js";
import { HttpError, readJson, route } from "#lib/server/http.js";

import type { RequestEvent, RequestHandler } from "./$types";

// 404 like the page: nobody who cannot use it needs to learn it is here.
function requireAdmin({ cookies }: RequestEvent): string {
  const key = cookies.get("key");
  if (key === undefined || !isAdmin(key)) throw new HttpError(404, "Not found");
  return key;
}

export const POST: RequestHandler = route(async (event) => {
  const key = requireAdmin(event);
  const { userKey, admin } = await readJson(event.request);
  if (typeof userKey !== "string" || typeof admin !== "boolean")
    throw new HttpError(400, "userKeyとadminを指定してください");
  const error = setAdmin(userKey, admin, key);
  if (error !== undefined) throw new HttpError(400, error);
  return json({ ok: true });
});

export const DELETE: RequestHandler = route(async (event) => {
  const key = requireAdmin(event);
  const { userKey } = await readJson(event.request);
  if (typeof userKey !== "string")
    throw new HttpError(400, "userKeyを指定してください");
  const result = deleteUser(userKey, key);
  if ("error" in result) throw new HttpError(400, result.error);
  return json({ ok: true, images: result.images });
});
