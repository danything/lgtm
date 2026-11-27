import { redirect } from "@sveltejs/kit";

import { parseFolder } from "#lib/folders.js";
import { FIRST_LIMIT } from "#lib/paging.js";
import { findAccount } from "#lib/server/account.js";
import { listFolders } from "#lib/server/folders.js";
import { get } from "#lib/server/lgtm.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, url }) => {
  const wkey = cookies.get("key");
  // The header does not offer this page signed out either.
  if (!findAccount(wkey) || wkey === undefined) redirect(307, "/");

  const folders = listFolders(wkey);
  let folder = parseFolder(url.searchParams.get("folder"));
  // A deleted or someone else's folder falls back to all.
  if (typeof folder === "number" && !folders.some((f) => f.id === folder))
    folder = undefined;
  return {
    wkey,
    folders,
    folder,
    images: get(0, FIRST_LIMIT, true, wkey, folder),
  };
};
