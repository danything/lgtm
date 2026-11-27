// The model's input from a stamped picture. The LGTM mark is painted out first:
// left in, it pulled most photos into 画面・文字 (49% right against 87%).

export const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

export type Rgba = { data: Uint8Array; width: number; height: number };

/** 1 where the mark lies on a w×h picture, placed as the stamper places it. */
export function markMask(mark: Rgba, w: number, h: number): Uint8Array {
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

/**
 * Area-averages the middle square to SIZE×SIZE, skipping masked pixels. A cell
 * mostly under the mark comes out unknown (0 in `known`).
 */
export function shrink(picture: Rgba, mask: Uint8Array) {
  const { data, width: w, height: h } = picture;
  const side = Math.min(w, h);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const rgb = new Float32Array(SIZE * SIZE * 3);
  const known = new Uint8Array(SIZE * SIZE);
  const edge = (i: number) => Math.floor((i * side) / SIZE);
  for (let ty = 0; ty < SIZE; ty++) {
    const ya = sy + edge(ty);
    const yb = Math.max(ya + 1, sy + edge(ty + 1));
    for (let tx = 0; tx < SIZE; tx++) {
      const xa = sx + edge(tx);
      const xb = Math.max(xa + 1, sx + edge(tx + 1));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
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
      const t = ty * SIZE + tx;
      rgb[t * 3] = r / n;
      rgb[t * 3 + 1] = g / n;
      rgb[t * 3 + 2] = b / n;
      known[t] = 1;
    }
  }
  return { rgb, known };
}

/** Fills unknown pixels from coarser averages of the known ones (push-pull). */
export function fill(rgb: Float32Array, known: Uint8Array, size: number): void {
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
          const yy = y * 2 + dy;
          const xx = x * 2 + dx;
          const t = yy * size + xx;
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

/** CHW floats, normalised as CLIP was trained. */
export function modelInput(picture: Rgba, mark: Rgba): Float32Array {
  const { rgb, known } = shrink(
    picture,
    markMask(mark, picture.width, picture.height),
  );
  fill(rgb, known, SIZE);
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++)
    for (let c = 0; c < 3; c++)
      out[c * plane + i] = (rgb[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  return out;
}
