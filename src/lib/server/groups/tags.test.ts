import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";

import db from "../db";
import { create, deleteFile, get, groupSections, popularTags } from "../lgtm";
import { useScratchDir, webpFile } from "../testing";
import {
  forgetTagStats,
  groupLater,
  startGrouping,
  useEmbedder,
} from "./index";
import {
  cosines,
  fold,
  pickTags,
  StatsBuilder,
  TAG_WORDS,
  tagsFor,
  vectorOf,
} from "./tags";

test("every tag is written once", () => {
  const firsts = TAG_WORDS.map((w) => w[0]);
  expect(new Set(firsts).size).toBe(firsts.length);
});

test("kana, width and case fold together", () => {
  expect(fold("ネコ")).toBe(fold("ねこ"));
  expect(fold("ﾈｺ")).toBe(fold("ねこ"));
  expect(fold(" ＰＣ ")).toBe("pc");
});

describe("which tags a search means", () => {
  test("any way the tag is written", () => {
    expect(tagsFor("ねこ")).toEqual([["猫"]]);
    expect(tagsFor("ネコ")).toEqual([["猫"]]);
    expect(tagsFor("cat")).toEqual([["猫"]]);
    expect(tagsFor("泣いてる")).toEqual([["泣く"]]);
  });

  test("the start of a tag, while typing", () => {
    expect(tagsFor("ラーメ")).toEqual([["ラーメン"]]);
  });

  test("tags inside the words", () => {
    expect(tagsFor("笑顔でピース")[0]).toEqual(
      expect.arrayContaining(["笑顔", "ピース"]),
    );
  });

  test("not inside other words", () => {
    // ピース is in ワンピース, which is a way to write ドレス.
    expect(tagsFor("ピース")).toEqual([["ピース"]]);
    // A single letter only finds itself.
    expect(tagsFor("海老")).toEqual([[]]);
  });

  test("one list per word, so both have to match", () => {
    expect(tagsFor("猫  夜景")).toEqual([["猫"], ["夜景"]]);
  });

  test("an empty search means no tags", () => {
    expect(tagsFor("  ")).toEqual([]);
  });
});

test("a picture of a tag gets it first", () => {
  for (const word of ["猫", "ラーメン", "夜景", "ギター"])
    expect(pickTags(vectorOf(word))[0].tag).toBe(word);
});

test("a strict tag needs the picture to stand far out from the rest", () => {
  const shiba = vectorOf("柴犬");
  // Without stats there is nothing to stand out from.
  expect(pickTags(shiba).map((t) => t.tag)).not.toContain("柴犬");
  const stats = new StatsBuilder();
  for (const word of ["ラーメン", "夜景", "ギター", "ピース", "海"])
    stats.add(cosines(vectorOf(word)));
  expect(pickTags(shiba, stats.done())[0].tag).toBe("柴犬");
});

describe("search", () => {
  beforeAll(() => {
    useScratchDir();
    mkdirSync("images");
  });
  beforeEach(async () => {
    await groupLater([]);
    db().run("DELETE FROM lImage");
    // Another file's start leaves stats from its own pictures.
    forgetTagStats();
  });

  /** Uploads one picture per word, each its own size, tagged as that word. */
  async function upload(words: string[]): Promise<string[]> {
    let calls = 0;
    useEmbedder(async () => vectorOf(words[calls++]));
    const names = await create(
      words.map((_, i) => webpFile(i + 1, 1)),
      "u1",
    );
    await groupLater(names);
    return names;
  }
  const search = (q: string, group?: "food") =>
    get(0, 10, false, undefined, undefined, { q, group }).map((i) => i.name);

  test("finds pictures by their tags, in any spelling", async () => {
    const [ramen, cat, night] = await upload(["ラーメン", "猫", "夜景"]);
    expect(search("ラーメン")).toEqual([ramen]);
    expect(search("ねこ")).toEqual([cat]);
    expect(search("夜景")).toEqual([night]);
    expect(search("ラーメン 猫")).toEqual([]);
    expect(search("見たことのない言葉")).toEqual([]);
  });

  test("narrows by group, and counts what it found per group", async () => {
    const [ramen] = await upload(["ラーメン", "猫"]);
    expect(search("ラーメン", "food")).toEqual([ramen]);
    expect(groupSections("ラーメン")).toEqual([
      { key: "food", label: "食べ物", count: 1 },
    ]);
    expect(groupSections("見たことのない言葉")).toEqual([]);
  });

  test("tags come back from the stored embeddings at a start", async () => {
    await upload(["ラーメン", "猫"]);
    db().run("DELETE FROM lImageTag");
    expect(search("ラーメン")).toEqual([]);
    useEmbedder(() => Promise.reject(new Error("not called")));
    await startGrouping();
    expect(search("ラーメン")).toHaveLength(1);
    expect(popularTags(20)).toEqual(expect.arrayContaining(["ラーメン", "猫"]));
  });

  test("a picture deleted while a start retags gets no tags back", async () => {
    // Deleted some turns into the start: one of them falls after it has read
    // the embeddings and before it writes the tags.
    for (let turns = 0; turns < 6; turns++) {
      db().run("DELETE FROM lImage");
      const names = await upload(["ラーメン", "猫"]);
      useEmbedder(() => Promise.reject(new Error("not called")));
      const start = startGrouping();
      for (let i = 0; i < turns; i++)
        await new Promise((resolve) => setTimeout(resolve));
      expect(deleteFile(names[0], "u1")).toBe(true);
      await start;
    }
    expect(
      db()
        .query(
          "SELECT COUNT(*) AS n FROM lImageTag WHERE imageId NOT IN (SELECT id FROM lImage)",
        )
        .get(),
    ).toEqual({ n: 0 });
  });

  test("a deleted picture takes its tags with it", async () => {
    const [ramen] = await upload(["ラーメン"]);
    expect(deleteFile(ramen, "u1")).toBe(true);
    expect(db().query("SELECT COUNT(*) AS n FROM lImageTag").get()).toEqual({
      n: 0,
    });
  });
});
