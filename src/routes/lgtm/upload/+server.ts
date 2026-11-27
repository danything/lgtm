import { json } from "@sveltejs/kit";

import { requireAccount } from "#lib/server/account.js";
import { readForm, route } from "#lib/server/http.js";
import { create } from "#lib/server/lgtm.js";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = route(async ({ request, cookies }) => {
  const userKey = requireAccount(cookies);
  const files = (await readForm(request))
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  return json({ ok: true, files: await create(files, userKey) });
});
