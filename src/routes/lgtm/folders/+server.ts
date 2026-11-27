import { json } from "@sveltejs/kit";

import { requireAccount } from "#lib/server/account.js";
import { createFolder, listFolders } from "#lib/server/folders.js";
import { readJson, route } from "#lib/server/http.js";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = route(({ cookies }) =>
  json(listFolders(requireAccount(cookies))),
);

export const POST: RequestHandler = route(async ({ request, cookies }) => {
  const userKey = requireAccount(cookies);
  const { name } = await readJson(request);
  return json(createFolder(userKey, name), { status: 201 });
});
