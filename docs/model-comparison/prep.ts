import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Paints out the LGTM mark and area-averages the middle square, as
// src/lib/server/groups/pixels.ts does, at several sizes. First frame only.
// Writes /w/out/px-<S>.u8 (N×S×S×3, RGB) and /w/out/meta.json.
import sharp from "sharp";

const SIZES = [224, 256, 384];
const names = readFileSync("/w/data/names.txt", "utf8").trim().split("\n");
const m = await sharp("/w/data/mark.webp")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const mark = { data: m.data, width: m.info.width, height: m.info.height };

function markMask(w: number, h: number): Uint8Array {
  const k = Math.min(w / mark.width, h / mark.height);
  const x0 = (w - mark.width * k) / 2;
  const y0 = (h - mark.height * k) / 2;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const my = Math.floor((y + 0.5 - y0) / k);
    if (my < 0 || my >= mark.height) continue;
    for (let x = 0; x < w; x++) {
      const mx = Math.floor((x + 0.5 - x0) / k);
      if (mx < 0 || mx >= mark.width) continue;
      if (mark.data[(my * mark.width + mx) * 4 + 3] > 8) mask[y * w + x] = 1;
    }
  }
  return mask;
}

function shrink(
  data: Uint8Array,
  w: number,
  h: number,
  mask: Uint8Array,
  S: number,
) {
  const side = Math.min(w, h);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const rgb = new Float32Array(S * S * 3);
  const known = new Uint8Array(S * S);
  const edge = (i: number) => Math.floor((i * side) / S);
  for (let ty = 0; ty < S; ty++) {
    const ya = sy + edge(ty);
    const yb = Math.max(ya + 1, sy + edge(ty + 1));
    for (let tx = 0; tx < S; tx++) {
      const xa = sx + edge(tx);
      const xb = Math.max(xa + 1, sx + edge(tx + 1));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = ya; y < yb; y++)
        for (let x = xa; x < xb; x++) {
          if (mask[y * w + x]) continue;
          const p = (y * w + x) * 4;
          r += data[p];
          g += data[p + 1];
          b += data[p + 2];
          n++;
        }
      if (n * 2 < (yb - ya) * (xb - xa)) continue;
      const t = ty * S + tx;
      rgb[t * 3] = r / n;
      rgb[t * 3 + 1] = g / n;
      rgb[t * 3 + 2] = b / n;
      known[t] = 1;
    }
  }
  return { rgb, known };
}

function fill(rgb: Float32Array, known: Uint8Array, size: number): void {
  if (size <= 1) return;
  const half = Math.ceil(size / 2);
  const coarse = new Float32Array(half * half * 3);
  const coarseKnown = new Uint8Array(half * half);
  for (let y = 0; y < half; y++)
    for (let x = 0; x < half; x++) {
      const sum = [0, 0, 0];
      let n = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const yy = y * 2 + dy,
            xx = x * 2 + dx,
            t = yy * size + xx;
          if (yy >= size || xx >= size || !known[t]) continue;
          for (let c = 0; c < 3; c++) sum[c] += rgb[t * 3 + c];
          n++;
        }
      if (n === 0) continue;
      const t = y * half + x;
      for (let c = 0; c < 3; c++) coarse[t * 3 + c] = sum[c] / n;
      coarseKnown[t] = 1;
    }
  fill(coarse, coarseKnown, half);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const t = y * size + x;
      if (known[t]) continue;
      const from = (y >> 1) * half + (x >> 1);
      for (let c = 0; c < 3; c++) rgb[t * 3 + c] = coarse[from * 3 + c];
    }
}

mkdirSync("/w/out", { recursive: true });
const bufs = SIZES.map((S) => new Float32Array(names.length * S * S * 3));
const meta: { name: string; width: number; height: number; ok: boolean }[] = [];
for (const [i, name] of names.entries()) {
  try {
    const { data, info } = await sharp(`/w/all/${name}`, { pages: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mask = markMask(info.width, info.height);
    SIZES.forEach((S, k) => {
      const { rgb, known } = shrink(data, info.width, info.height, mask, S);
      fill(rgb, known, S);
      const off = i * S * S * 3;
      for (let j = 0; j < rgb.length; j++) bufs[k][off + j] = rgb[j];
    });
    meta.push({ name, width: info.width, height: info.height, ok: true });
  } catch (e) {
    console.error(name, (e as Error).message);
    meta.push({ name, width: 0, height: 0, ok: false });
  }
  if (i % 200 === 0) console.log(i);
}
SIZES.forEach((S, k) => writeFileSync(`/w/out/px-${S}.f32`, bufs[k]));
writeFileSync("/w/out/meta.json", JSON.stringify(meta));
console.log("done", meta.filter((x) => x.ok).length);
