import { describe, expect, test } from "bun:test";

import { webp } from "./testing";
import { webpSize } from "./webp";

describe("webpSize", () => {
  test("reads a lossless header", () => {
    expect(webpSize(webp(960, 480))).toEqual({ width: 960, height: 480 });
  });

  test("reads an extended (VP8X) header", () => {
    const bytes = new Uint8Array(40);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    view.setUint32(4, 32, true);
    bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
    view.setUint32(16, 10, true);
    view.setUint32(24, 499, true);
    view.setUint32(27, 299, true);
    expect(webpSize(bytes)).toEqual({ width: 500, height: 300 });
  });

  test("rejects what is not a whole WebP", () => {
    const good = webp(10, 10);
    expect(webpSize(new Uint8Array(10))).toBeNull();
    expect(webpSize(good.subarray(0, good.length - 1))).toBeNull();
    const png = good.slice();
    png.set(new TextEncoder().encode("PNG "), 8);
    expect(webpSize(png)).toBeNull();
  });
});
