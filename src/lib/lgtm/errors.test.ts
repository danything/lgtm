import { expect, test } from "bun:test";

import { ConvertError, convertMessage } from "./errors";

test("names the file and the reason", () => {
  expect(convertMessage(new ConvertError("corrupt", "a.gif"))).toBe(
    "「a.gif」: 画像が壊れているか、読み込めませんでした",
  );
  expect(convertMessage(new ConvertError("too-large", ""))).toContain("100MB");
});
