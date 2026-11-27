import { type GroupKey, isGroup } from "#lib/groups.js";
import { FIRST_LIMIT, STRIP_LIMIT } from "#lib/paging.js";
import { get, groupSections } from "#lib/server/lgtm.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, url }) => {
  const wkey = cookies.get("key");
  const param = url.searchParams.get("group");
  const group: GroupKey | "all" | undefined =
    param === "all" ? "all" : isGroup(param) ? param : undefined;
  const groups = groupSections();
  const base = { message: cookies.get("message"), wkey, groups, group };

  // One group, or every picture newest first, as one long gallery.
  if (group !== undefined)
    return {
      ...base,
      images: get(
        0,
        FIRST_LIMIT,
        false,
        wkey,
        undefined,
        group === "all" ? undefined : group,
      ),
      sections: [],
    };
  // Otherwise a row per group, after the newest.
  return {
    ...base,
    images: get(0, STRIP_LIMIT, false, wkey),
    sections: groups.map((g) => ({
      ...g,
      images: get(0, STRIP_LIMIT, false, wkey, undefined, g.key),
    })),
  };
};
