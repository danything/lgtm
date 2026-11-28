import { expect, test } from "bun:test";

import { MAX_QUERY, parseQuery, topHref } from "./search";

test("a search is trimmed, capped, and empty means none", () => {
  expect(parseQuery("  猫 ")).toBe("猫");
  expect(parseQuery("   ")).toBeUndefined();
  expect(parseQuery(null)).toBeUndefined();
  expect(parseQuery("あ".repeat(500))).toHaveLength(MAX_QUERY);
});

test("links keep only what is set", () => {
  expect(topHref({})).toBe("/");
  expect(topHref({ q: "猫 夜景", group: undefined })).toBe(
    "/?q=%E7%8C%AB+%E5%A4%9C%E6%99%AF",
  );
  expect(topHref({ q: "a", group: "person", scene: "pose" })).toBe(
    "/?q=a&group=person&scene=pose",
  );
});
