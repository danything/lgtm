import type { Cookies } from "@sveltejs/kit";

import db from "./db";
import { HttpError } from "./http";
import type { GhUser } from "./model";

export function findAccount(key: string | undefined): GhUser | null {
  if (key === undefined) return null;
  return db()
    .query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
    .get(key);
}

/** Without this check any cookie value would be a working identity. */
export const accountExists = (key: string) => findAccount(key) !== null;

/** The signed-in account's key, or a 401. */
export function requireAccount(cookies: Cookies): string {
  const key = cookies.get("key");
  if (key === undefined || !accountExists(key))
    throw new HttpError(401, "ログインしてください");
  return key;
}
