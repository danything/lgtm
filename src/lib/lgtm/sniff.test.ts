import { expect, test } from "bun:test";

import { sniff } from "./sniff";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

/** An ISO-BMFF ftyp box with a major brand and compatible ones. */
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + 4 * compatible.length;
  return bytes(
    [0, 0, 0, size],
    "ftyp",
    major,
    [0, 0, 0, 0],
    ...compatible,
    [0, 0, 0, 0],
  );
};

test("recognises formats by their first bytes", () => {
  expect(sniff(bytes("GIF89a", [0, 0, 0, 0]))).toBe("gif");
  expect(sniff(bytes([0x89], "PNG", [13, 10, 26, 10]))).toBe("png");
  expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  expect(sniff(bytes("BM", [0, 0]))).toBe("bmp");
  expect(sniff(bytes("  <svg xmlns='x'>"))).toBe("svg");
  expect(sniff(bytes("hello world"))).toBeNull();
});

test("tells still and animated WebP apart", () => {
  const head = (flags: number) =>
    bytes("RIFF", [0, 0, 0, 0], "WEBPVP8X", [10, 0, 0, 0, flags, 0, 0, 0]);
  expect(sniff(head(0))).toBe("webp");
  expect(sniff(head(0x02))).toBe("webp-animated");
});

test("tells HEIC and AVIF apart, though AVIF also lists mif1", () => {
  expect(sniff(ftyp("heic", "mif1", "heic"))).toBe("heif");
  expect(sniff(ftyp("mif1", "heic"))).toBe("heif");
  expect(sniff(ftyp("avif", "mif1", "miaf"))).toBe("avif");
  expect(sniff(ftyp("mif1", "avif"))).toBe("avif");
  expect(sniff(ftyp("isom", "mp41"))).toBeNull();
});
