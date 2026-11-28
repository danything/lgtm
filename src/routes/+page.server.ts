import { type GroupKey, isGroup, isScene, type SceneKey } from "#lib/groups.js";
import { FIRST_LIMIT, STRIP_LIMIT } from "#lib/paging.js";
import { parseQuery } from "#lib/search.js";
import {
  get,
  groupSections,
  popularTags,
  sceneSections,
} from "#lib/server/lgtm.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, url }) => {
  const wkey = cookies.get("key");
  const param = url.searchParams.get("group");
  const group: GroupKey | "all" | undefined =
    param === "all" ? "all" : isGroup(param) ? param : undefined;
  const sceneParam = url.searchParams.get("scene");
  const scene =
    group === "person" && isScene(sceneParam) ? sceneParam : undefined;
  const q = parseQuery(url.searchParams.get("q"));
  // A search counts only what it finds.
  const groups = groupSections(q);
  // The top shows 人's scenes too, beside its row, so they are not hidden.
  const scenes =
    group === "person" || (group === undefined && q === undefined)
      ? sceneSections(q)
      : [];
  const base = {
    message: cookies.get("message"),
    wkey,
    groups,
    group,
    scenes,
    scene,
    q,
    found: undefined as number | undefined,
    popular: [] as string[],
  };

  // A search is one long gallery, best match first, in a group or scene if one
  // is open.
  if (q !== undefined) {
    const found =
      scene !== undefined
        ? (scenes.find((s) => s.key === scene)?.count ?? 0)
        : group !== undefined && group !== "all"
          ? (groups.find((g) => g.key === group)?.count ?? 0)
          : groups.reduce((n, g) => n + g.count, 0);
    return {
      ...base,
      found,
      // Words that do find something, for a search that found nothing.
      popular: found === 0 ? popularTags(12) : [],
      images: get(0, FIRST_LIMIT, false, wkey, undefined, {
        group: group === "all" ? undefined : group,
        scene,
        q,
      }),
      rows: [],
    };
  }
  // The filter goes with the row so it can fetch more as it scrolls sideways.
  const strip = (
    filter: { group?: GroupKey; scene?: SceneKey },
    more: string,
  ) => ({
    images: get(0, STRIP_LIMIT, false, wkey, undefined, filter),
    filter,
    more,
  });

  // 人 opens as a row per scene, like the top does per group.
  if (group === "person" && scene === undefined)
    return {
      ...base,
      images: [],
      rows: scenes.map((s) => ({
        ...s,
        subs: [],
        ...strip({ group, scene: s.key }, `/?group=person&scene=${s.key}`),
      })),
    };
  // One group or scene, or every picture newest first, as one long gallery.
  if (group !== undefined)
    return {
      ...base,
      images: get(0, FIRST_LIMIT, false, wkey, undefined, {
        group: group === "all" ? undefined : group,
        scene,
      }),
      rows: [],
    };
  // Otherwise a row per group, after the newest.
  return {
    ...base,
    images: [],
    rows: [
      {
        key: "all",
        label: "新着",
        count: undefined,
        subs: [],
        ...strip({}, "/?group=all"),
      },
      ...groups.map((g) => ({
        ...g,
        subs: g.key === "person" ? scenes : [],
        ...strip({ group: g.key }, `/?group=${g.key}`),
      })),
    ],
  };
};
