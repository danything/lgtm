import { json } from "@sveltejs/kit";

import { parseFolder } from "#lib/folders.js";
import { isGroup, isScene } from "#lib/groups.js";
import { PER_PAGE } from "#lib/paging.js";
import { parseQuery } from "#lib/search.js";
import { get } from "#lib/server/lgtm.js";

import type { RequestHandler } from "./$types";

const int = (value: string | null, fallback: number) =>
  Math.floor(Number(value) || fallback);

export const GET: RequestHandler = ({ url, cookies }) => {
  const offset = Math.max(0, int(url.searchParams.get("offset"), 0));
  // Capped so a hand-written URL cannot ask for the whole table.
  const limit = Math.min(
    PER_PAGE,
    Math.max(1, int(url.searchParams.get("limit"), PER_PAGE)),
  );
  const find = url.searchParams.get("find") === "true";
  const folder = parseFolder(url.searchParams.get("folder"));
  const group = url.searchParams.get("group");
  const scene = url.searchParams.get("scene");
  const q = parseQuery(url.searchParams.get("q"));
  return json(
    get(offset, limit, find, cookies.get("key"), folder, {
      group: isGroup(group) ? group : undefined,
      scene: isScene(scene) ? scene : undefined,
      q,
    }),
  );
};
