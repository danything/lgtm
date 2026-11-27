import { findAccount } from "#lib/server/account.js";
import { isAdmin } from "#lib/server/admin.js";
import { parseTheme, THEME_COOKIE } from "#lib/theme.js";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies }) => {
  const key = cookies.get("key");
  return {
    isAdmin: isAdmin(key),
    ghLogin: findAccount(key)?.login,
    theme: parseTheme(cookies.get(THEME_COOKIE)),
  };
};
