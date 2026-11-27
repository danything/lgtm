import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import db from "./db";
import {
  backfillImageSizes,
  create,
  deleteAllImages,
  deleteFile,
  get,
  InvalidImageError,
} from "./lgtm";
import { useScratchDir, webp, webpFile } from "./testing";

beforeAll(() => {
  useScratchDir();
  mkdirSync("images");
});

beforeEach(() => {
  db().run("DELETE FROM lImage");
  for (const f of readdirSync("images")) unlinkSync(`images/${f}`);
});

describe("create", () => {
  test("stores each file and answers with the names in order", async () => {
    const names = await create([webpFile(10, 20), webpFile(30, 40)], "u1");
    expect(names).toHaveLength(2);
    for (const n of names) expect(existsSync(`images/${n}`)).toBe(true);
    expect(get(0, 10, true, "u1").map((i) => i.name)).toEqual(
      [...names].reverse(),
    );
  });

  test("records the size", async () => {
    await create([webpFile(10, 20)], "u1");
    const [image] = get(0, 10, false, "u1");
    expect([image.width, image.height]).toEqual([10, 20]);
  });

  test("rejects the whole batch when one file is bad", async () => {
    const bad = new File([new Uint8Array(40)], "x.png");
    await expect(create([webpFile(10, 10), bad], "u1")).rejects.toBeInstanceOf(
      InvalidImageError,
    );
    expect(get(0, 10, false)).toEqual([]);
  });

  test("rejects more than 960px on a side", async () => {
    await expect(create([webpFile(961, 10)], "u1")).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });
});

describe("get", () => {
  test("newest first, paged by position, owner marked deletable", async () => {
    const a = await create([webpFile(1, 1)], "u1");
    const b = await create([webpFile(1, 1)], "u2");
    const all = get(0, 10, false, "u1");
    expect(all.map((i) => i.name)).toEqual([...b, ...a]);
    expect(all.map((i) => i.isDeletable)).toEqual([false, true]);
    expect(get(1, 1, false).map((i) => i.name)).toEqual(a);
    expect(get(0, 10, true, "u2").map((i) => i.name)).toEqual(b);
  });

  test("falls back to a square for rows without a size", async () => {
    const [name] = await create([webpFile(5, 5)], "u1");
    db().run("UPDATE lImage SET width = NULL, height = NULL");
    expect(get(0, 1, false)[0]).toMatchObject({ name, width: 960 });
  });
});

describe("delete", () => {
  test("only the owner can delete, and the file goes too", async () => {
    const [name] = await create([webpFile(1, 1)], "u1");
    expect(deleteFile(name, "u2")).toBe(false);
    expect(deleteFile(name, "u1")).toBe(true);
    expect(existsSync(`images/${name}`)).toBe(false);
  });

  test("deleteAllImages removes one owner's images", async () => {
    await create([webpFile(1, 1), webpFile(1, 1)], "u1");
    await create([webpFile(1, 1)], "u2");
    expect(deleteAllImages("u1")).toBe(2);
    expect(get(0, 10, false)).toHaveLength(1);
  });
});

test("backfillImageSizes reads sizes off disk", async () => {
  writeFileSync("images/old.webp", webp(7, 9));
  db().run(
    "INSERT INTO lImage (fileName, userKey, createdAt) VALUES ('old.webp', 'u1', 0)",
  );
  await backfillImageSizes();
  expect(get(0, 1, false)[0]).toMatchObject({ width: 7, height: 9 });
});
