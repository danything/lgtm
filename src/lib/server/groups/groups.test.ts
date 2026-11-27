import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";

import type { GroupKey, SceneKey } from "#lib/groups.js";

import db from "../db";
import { create, get, groupSections, sceneSections } from "../lgtm";
import { useScratchDir, webpFile } from "../testing";
import centroids from "./centroids.json";
import { groupLater, startGrouping, useEmbedder } from "./index";
import { fill, markMask, modelInput, SIZE } from "./pixels";
import sceneCentroids from "./scene-centroids.json";
import { pickGroup, pickScene, unit } from "./score";

const vector = (key: GroupKey) => new Float32Array(centroids[key]);

describe("pixels", () => {
  // A 4×2 mark, opaque on its left half only.
  const mark = {
    width: 4,
    height: 2,
    data: new Uint8Array(4 * 2 * 4).map((_, i) =>
      i % 4 === 3 && Math.floor(i / 4) % 4 < 2 ? 255 : 0,
    ),
  };

  test("the mask sits where the stamper puts the mark", () => {
    // 8×8 picture: the mark is scaled ×2 to 8×4 and centred, rows 2..5.
    const mask = markMask(mark, 8, 8);
    const row = (y: number) => mask.slice(y * 8, y * 8 + 8).join("");
    expect(row(1)).toBe("00000000");
    expect(row(2)).toBe("11110000");
    expect(row(5)).toBe("11110000");
    expect(row(6)).toBe("00000000");
  });

  test("unknown pixels take their neighbours' colour", () => {
    const rgb = new Float32Array(4 * 4 * 3).fill(200);
    const known = new Uint8Array(16).fill(1);
    known[5] = 0;
    rgb.fill(0, 15, 18);
    fill(rgb, known, 4);
    expect(rgb[15]).toBeCloseTo(200);
  });

  test("a picture under a mark comes out as if the mark were not there", () => {
    const red = {
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4).map((_, i) =>
        i % 4 === 0 || i % 4 === 3 ? 255 : 0,
      ),
    };
    const out = modelInput(red, mark);
    expect(out).toHaveLength(3 * SIZE * SIZE);
    // Every pixel, masked or not, is the same red.
    expect(new Set(out.slice(0, SIZE * SIZE)).size).toBe(1);
  });
});

test("picks the group whose prompts are nearest", () => {
  for (const key of ["person", "food", "cat"] as const)
    expect(pickGroup(vector(key))).toBe(key);
});

describe("grouping", () => {
  // Pictures with one answer and one size count as copies of a shot, so
  // these give each its own size.
  beforeAll(() => {
    useScratchDir();
    mkdirSync("images");
  });
  beforeEach(async () => {
    // Lets a run another test file started (with no model) finish first.
    await groupLater([]);
    db().run("DELETE FROM lImage");
  });

  test("groups uploads, then regroups from what it stored", async () => {
    const answers: GroupKey[] = ["food", "person", "person"];
    let calls = 0;
    useEmbedder(async () => vector(answers[calls++]));
    const names = await create(
      [webpFile(1, 1), webpFile(2, 1), webpFile(3, 1)],
      "u1",
    );
    await groupLater(names);
    expect(groupSections()).toEqual([
      { key: "person", label: "人", count: 2 },
      { key: "food", label: "食べ物", count: 1 },
    ]);
    expect(
      get(0, 10, false, undefined, undefined, { group: "food" }),
    ).toHaveLength(1);

    // A start with the stored embeddings needs no model.
    db().run("UPDATE lImage SET grp = NULL");
    useEmbedder(() => Promise.reject(new Error("not called")));
    await startGrouping();
    expect(calls).toBe(3);
    expect(groupSections().map((g) => g.count)).toEqual([2, 1]);
  });

  test("a start groups the pictures stored before groups", async () => {
    useEmbedder(async () => vector("other"));
    await create([webpFile(1, 1)], "u1");
    await startGrouping();
    expect(groupSections()).toEqual([
      { key: "other", label: "その他", count: 1 },
    ]);
  });

  test("その他 comes last however big", async () => {
    const answers: GroupKey[] = ["other", "other", "cat"];
    let calls = 0;
    useEmbedder(async () => vector(answers[calls++]));
    await groupLater(
      await create([webpFile(1, 1), webpFile(2, 1), webpFile(3, 1)], "u1"),
    );
    expect(groupSections().map((g) => g.key)).toEqual(["cat", "other"]);
  });

  test("a picture queued as the run ends is not left behind", async () => {
    // Queued a few ticks after the last answer, around where the run stops.
    for (let ticks = 0; ticks < 5; ticks++) {
      db().run("DELETE FROM lImage");
      const [a, b] = await create([webpFile(1, 1), webpFile(2, 1)], "u1");
      let late: Promise<void> | undefined;
      useEmbedder(() => {
        const answer = Promise.resolve(vector("food"));
        if (!late) {
          let p: Promise<unknown> = answer;
          for (let i = 0; i < ticks; i++) p = p.then(() => {});
          late = p.then(() => groupLater([b]));
        }
        return answer;
      });
      await groupLater([a]);
      await late;
      expect(groupSections()).toEqual([
        { key: "food", label: "食べ物", count: 2 },
      ]);
    }
  });

  test("one picture failing does not stop the rest", async () => {
    let calls = 0;
    useEmbedder(async () => {
      if (calls++ === 0) throw new Error("broken");
      return vector("dog");
    });
    await groupLater(await create([webpFile(1, 1), webpFile(1, 1)], "u1"));
    expect(groupSections()).toEqual([{ key: "dog", label: "犬", count: 1 }]);
  });
});

test("picks the scene whose prompts are nearest", () => {
  for (const key of ["live", "selfie", "group"] as const)
    expect(pickScene(new Float32Array(sceneCentroids[key]))).toBe(key);
  // The three small ones all count as そのほか.
  expect(pickScene(new Float32Array(sceneCentroids["rest/sports"]))).toBe(
    "rest",
  );
});

describe("scenes and copies", () => {
  beforeAll(() => {
    useScratchDir();
    mkdirSync("images");
  });
  beforeEach(async () => {
    await groupLater([]);
    db().run("DELETE FROM lImage");
  });

  // 人, leaning towards one scene.
  const personIn = (scene: keyof typeof sceneCentroids) => {
    const p = vector("person");
    const s = sceneCentroids[scene];
    return unit(p.map((x, i) => x + 0.3 * s[i]));
  };

  test("人 is split by scene; other groups have none", async () => {
    const live = personIn("live");
    const selfie = personIn("selfie");
    expect([pickGroup(live), pickGroup(selfie)]).toEqual(["person", "person"]);
    const want = [pickScene(live), pickScene(selfie)] as SceneKey[];
    const answers = [live, live, selfie, vector("food")];
    let calls = 0;
    useEmbedder(async () => answers[calls++]);
    // Different sizes, so none counts as a copy of another.
    await groupLater(
      await create(
        [webpFile(4, 3), webpFile(3, 4), webpFile(5, 3), webpFile(1, 1)],
        "u1",
      ),
    );
    expect(sceneSections().map((s) => [s.key, s.count])).toEqual([
      [want[0], 2],
      [want[1], 1],
    ]);
    expect(
      get(0, 10, false, undefined, undefined, {
        group: "person",
        scene: want[1],
      }),
    ).toHaveLength(1);
    expect(
      db().query("SELECT scene FROM lImage WHERE grp = 'food'").all(),
    ).toEqual([{ scene: null }]);
  });

  test("the top shows one copy of a shot, the newest; the owner sees all", async () => {
    useEmbedder(async () => vector("food"));
    const [older] = await create([webpFile(4, 3)], "u1");
    const [newer] = await create([webpFile(4, 3)], "u2");
    // Same picture, other proportions: not a copy.
    const [other] = await create([webpFile(3, 4)], "u1");
    await groupLater([older, newer, other]);
    const top = get(0, 10, false).map((i) => i.name);
    expect(top.sort()).toEqual([newer, other].sort());
    expect(groupSections()).toEqual([
      { key: "food", label: "食べ物", count: 2 },
    ]);
    expect(
      get(0, 10, true, "u1")
        .map((i) => i.name)
        .sort(),
    ).toEqual([older, other].sort());

    // Keyed again newest first, the copies still end up together.
    db().run("UPDATE lImage SET dupKey = NULL");
    db().run("UPDATE lImage SET createdAt = -createdAt WHERE fileName != ?", [
      newer,
    ]);
    await startGrouping();
    expect(get(0, 10, false)).toHaveLength(2);
  });
});

test("a picture whose size is not known yet is nobody's copy", async () => {
  await groupLater([]);
  db().run("DELETE FROM lImage");
  useEmbedder(async () => vector("food"));
  const names = await create([webpFile(4, 4), webpFile(4, 4)], "u1");
  await groupLater(names);
  expect(get(0, 10, false)).toHaveLength(1);
  // Keyed again at a start, with one size lost.
  db().run("UPDATE lImage SET dupKey = NULL");
  db().run("UPDATE lImage SET width = NULL, height = NULL WHERE fileName = ?", [
    names[0],
  ]);
  await startGrouping();
  expect(get(0, 10, false)).toHaveLength(2);
});
