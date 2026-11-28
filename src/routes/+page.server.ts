import { type GroupKey, isGroup, isScene, type SceneKey } from "#lib/groups.js";
import { FIRST_LIMIT, STRIP_LIMIT } from "#lib/paging.js";
import { get, groupSections, sceneSections } from "#lib/server/lgtm.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, url }) => {
  const wkey = cookies.get("key");
  const param = url.searchParams.get("group");
  const group: GroupKey | "all" | undefined =
    param === "all" ? "all" : isGroup(param) ? param : undefined;
  const sceneParam = url.searchParams.get("scene");
  const scene =
    group === "person" && isScene(sceneParam) ? sceneParam : undefined;
  const groups = groupSections();
  // The top shows 人's scenes too, beside its row, so they are not hidden.
  const scenes =
    group === "person" || group === undefined ? sceneSections() : [];
  const base = {
    message: cookies.get("message"),
    wkey,
    groups,
    group,
    scenes,
    scene,
  };
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
