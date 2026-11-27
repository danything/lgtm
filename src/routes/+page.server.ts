import { type GroupKey, isGroup, isScene } from "#lib/groups.js";
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
  const scenes = group === "person" ? sceneSections() : [];
  const base = {
    message: cookies.get("message"),
    wkey,
    groups,
    group,
    scenes,
    scene,
  };
  const strip = (filter: Parameters<typeof get>[5], more: string) => ({
    images: get(0, STRIP_LIMIT, false, wkey, undefined, filter),
    more,
  });

  // 人 opens as a row per scene, like the top does per group.
  if (group === "person" && scene === undefined)
    return {
      ...base,
      images: [],
      rows: scenes.map((s) => ({
        ...s,
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
        ...strip({}, "/?group=all"),
      },
      ...groups.map((g) => ({
        ...g,
        ...strip({ group: g.key }, `/?group=${g.key}`),
      })),
    ],
  };
};
