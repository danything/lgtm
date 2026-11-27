import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";

import type { GroupKey } from "#lib/groups.js";

import db from "../db";
import { create, get, groupSections } from "../lgtm";
import { useScratchDir, webpFile } from "../testing";
import centroids from "./centroids.json";
import { groupLater, startGrouping, useEmbedder } from "./index";
import { fill, markMask, modelInput, SIZE } from "./pixels";
import { pickGroup } from "./score";

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
      [webpFile(1, 1), webpFile(1, 1), webpFile(1, 1)],
      "u1",
    );
    await groupLater(names);
    expect(groupSections()).toEqual([
      { key: "person", label: "人", count: 2 },
      { key: "food", label: "食べ物", count: 1 },
    ]);
    expect(get(0, 10, false, undefined, undefined, "food")).toHaveLength(1);

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
      await create([webpFile(1, 1), webpFile(1, 1), webpFile(1, 1)], "u1"),
    );
    expect(groupSections().map((g) => g.key)).toEqual(["cat", "other"]);
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
