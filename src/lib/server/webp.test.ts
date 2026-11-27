import { describe, expect, test } from "bun:test";

import { webp } from "./testing";
import { stripMetadata, webpSize } from "./webp";

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

/** An extended WebP: VP8X with the given flags, a lossless frame, then extras. */
function extended(flags: number, ...extra: [string, string][]): Uint8Array {
  const chunks: number[] = [];
  const add = (name: string, data: number[]) => {
    chunks.push(...[...name].map((c) => c.charCodeAt(0)));
    const n = data.length;
    chunks.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);
    chunks.push(...data);
    if (n % 2) chunks.push(0);
  };
  add("VP8X", [flags, 0, 0, 0, 9, 0, 0, 4, 0, 0]);
  add("VP8L", [0x2f, 9, 0x40, 0x01, 0, 0, 0, 0]);
  for (const [name, text] of extra)
    add(
      name,
      [...text].map((c) => c.charCodeAt(0)),
    );
  const out = new Uint8Array(12 + chunks.length);
  out.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, 4 + chunks.length, true);
  out.set(new TextEncoder().encode("WEBP"), 8);
  out.set(chunks, 12);
  return out;
}

describe("stripMetadata", () => {
  test("drops EXIF and XMP and clears their flags", () => {
    const withGps = extended(
      0x08 | 0x04 | 0x10,
      ["EXIF", "GPS 35N"],
      ["XMP ", "<x/>"],
    );
    const out = stripMetadata(withGps)!;
    expect(webpSize(out)).toEqual({ width: 10, height: 5 });
    expect(new TextDecoder().decode(out)).not.toContain("GPS");
    expect(out[20]).toBe(0x10);
    expect(out.length).toBeLessThan(withGps.length);
  });

  test("leaves a file without metadata as it is", () => {
    const plain = extended(0x10);
    expect(stripMetadata(plain)).toBe(plain);
  });

  test("rejects chunks that run past the end", () => {
    const bad = extended(0x08, ["EXIF", "abcd"]);
    new DataView(bad.buffer).setUint32(bad.length - 8, 999, true);
    expect(stripMetadata(bad)).toBeNull();
  });
});
