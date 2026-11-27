import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";

import { deleteUser } from "./admin";
import db from "./db";
import {
  createFolder,
  deleteFolder,
  listFolders,
  moveImages,
  renameFolder,
} from "./folders";
import { HttpError } from "./http";
import { create, get } from "./lgtm";
import { useScratchDir, webpFile } from "./testing";

beforeAll(() => {
  useScratchDir();
  mkdirSync("images");
});

beforeEach(() => {
  db().run("DELETE FROM lImage");
  db().run("DELETE FROM folder");
  db().run("DELETE FROM ghUser");
  db().run(
    "INSERT INTO ghUser (key, githubId, login) VALUES ('u1', '1', 'one'), ('u2', '2', 'two')",
  );
});

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
  return 200;
};

describe("folders", () => {
  test("create, list with counts, rename", async () => {
    const a = createFolder("u1", "  仕事 ");
    const b = createFolder("u1", "趣味");
    createFolder("u2", "仕事");
    expect(a.name).toBe("仕事");
    const [name] = await create([webpFile(1, 1)], "u1", a.id);
    expect(listFolders("u1")).toEqual([
      { id: a.id, name: "仕事", images: 1 },
      { id: b.id, name: "趣味", images: 0 },
    ]);
    renameFolder(b.id, "u1", "あそび");
    expect(listFolders("u1").map((f) => f.name)).toContain("あそび");
    expect(get(0, 10, true, "u1", a.id).map((i) => i.name)).toEqual([name]);
  });

  test("rejects empty, long and duplicate names", () => {
    createFolder("u1", "a");
    expect(status(() => createFolder("u1", "  "))).toBe(400);
    expect(status(() => createFolder("u1", "x".repeat(41)))).toBe(400);
    expect(status(() => createFolder("u1", "a"))).toBe(409);
    const b = createFolder("u1", "b");
    expect(status(() => renameFolder(b.id, "u1", "a"))).toBe(409);
  });

  test("someone else's folder is not found", () => {
    const theirs = createFolder("u2", "x");
    expect(status(() => renameFolder(theirs.id, "u1", "y"))).toBe(404);
    expect(status(() => deleteFolder(theirs.id, "u1"))).toBe(404);
    expect(status(() => moveImages(["a"], theirs.id, "u1"))).toBe(404);
  });

  test("deleting a folder keeps its images, unfiled", async () => {
    const f = createFolder("u1", "x");
    const names = await create([webpFile(1, 1), webpFile(1, 1)], "u1", f.id);
    expect(deleteFolder(f.id, "u1")).toBe(2);
    expect(listFolders("u1")).toEqual([]);
    expect(
      get(0, 10, true, "u1", "none")
        .map((i) => i.name)
        .sort(),
    ).toEqual([...names].sort());
  });

  test("moves only the caller's images, and back to none", async () => {
    const f = createFolder("u1", "x");
    const [mine] = await create([webpFile(1, 1)], "u1");
    const [theirs] = await create([webpFile(1, 1)], "u2");
    expect(moveImages([mine, theirs], f.id, "u1")).toBe(1);
    expect(get(0, 10, true, "u1", f.id).map((i) => i.folderId)).toEqual([f.id]);
    expect(get(0, 10, true, "u2", "none")).toHaveLength(1);
    moveImages([mine], null, "u1");
    expect(get(0, 10, true, "u1", f.id)).toEqual([]);
  });

  test("other people never see which folder an image is in", async () => {
    const f = createFolder("u1", "x");
    await create([webpFile(1, 1)], "u1", f.id);
    expect(get(0, 10, false, "u2")[0].folderId).toBeNull();
    expect(get(0, 10, false, "u1")[0].folderId).toBe(f.id);
  });

  test("deleting the account removes its folders", () => {
    createFolder("u2", "x");
    expect(deleteUser("u2", "u1")).toEqual({ images: 0 });
    expect(listFolders("u2")).toEqual([]);
  });
});
