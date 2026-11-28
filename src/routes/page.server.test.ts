import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { STRIP_LIMIT } from "#lib/paging.js";
import db from "#lib/server/db.js";
import { useScratchDir } from "#lib/server/testing.js";

import { load } from "./+page.server";

type Row = {
  key: string;
  images: unknown[];
  filter: { group?: string; scene?: string };
  more: string;
  subs: { key: string; count: number }[];
};

/** Calls the top page's load with just the parts of the event it reads. */
const top = (query = "") =>
  load({
    cookies: { get: () => undefined },
    url: new URL(`http://l.localhost/${query}`),
  } as never) as { rows: Row[] };

let made = 0;
function add(n: number, grp: string, scene: string | null = null) {
  for (let i = 0; i < n; i++, made++)
    db().run(
      "INSERT INTO lImage (fileName, userKey, createdAt, width, height, grp, scene) VALUES (?, 'u1', ?, 300, 400, ?, ?)",
      [`${made}.webp`, made, grp, scene],
    );
}

beforeAll(() => {
  useScratchDir();
});

beforeEach(() => {
  db().run("DELETE FROM lImage");
});

describe("top page rows", () => {
  test("start with enough tiles to run past a wide window", () => {
    add(STRIP_LIMIT + 5, "food");
    const food = top().rows.find((r) => r.key === "food")!;
    expect(STRIP_LIMIT).toBeGreaterThanOrEqual(20);
    expect(food.images).toHaveLength(STRIP_LIMIT);
  });

  test("carry their filter and page, to fetch the rest sideways", () => {
    add(1, "food");
    add(1, "person", "selfie");
    const rows = top().rows;
    expect(rows.map((r) => [r.key, r.filter, r.more])).toEqual([
      ["all", {}, "/?group=all"],
      ["person", { group: "person" }, "/?group=person"],
      ["food", { group: "food" }, "/?group=food"],
    ]);
  });

  test("人 shows its scenes, biggest first, and no other group has any", () => {
    add(1, "person", "selfie");
    add(3, "person", "live");
    add(2, "person", "rest");
    add(2, "food");
    const rows = top().rows;
    const person = rows.find((r) => r.key === "person")!;
    expect(person.subs.map((s) => [s.key, s.count])).toEqual([
      ["live", 3],
      ["selfie", 1],
      ["rest", 2],
    ]);
    for (const r of rows.filter((r) => r.key !== "person"))
      expect(r.subs).toEqual([]);
  });

  test("人's own page keeps a row per scene, each with its scene", () => {
    add(2, "person", "live");
    const rows = top("?group=person").rows;
    expect(rows.map((r) => [r.key, r.filter, r.subs])).toEqual([
      ["live", { group: "person", scene: "live" }, []],
    ]);
  });
});
