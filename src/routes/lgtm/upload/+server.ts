import { json } from "@sveltejs/kit";

import { parseFolder } from "#lib/folders.js";
import { requireAccount } from "#lib/server/account.js";
import { requireFolder } from "#lib/server/folders.js";
import { readForm, route } from "#lib/server/http.js";
import { create } from "#lib/server/lgtm.js";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = route(async ({ request, cookies }) => {
  const userKey = requireAccount(cookies);
  const form = await readForm(request);
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  const folder = parseFolder(form.get("folderId")?.toString());
  const folderId = typeof folder === "number" ? folder : null;
  if (folderId !== null) requireFolder(folderId, userKey);
  return json({ ok: true, files: await create(files, userKey, folderId) });
});
