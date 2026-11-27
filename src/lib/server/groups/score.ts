import type { GroupKey } from "#lib/groups.js";

import centroids from "./centroids.json";
import { MODEL } from "./clip";

const CENTROIDS = Object.entries(centroids) as [GroupKey, number[]][];

export function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** The group whose prompts sit closest to the picture. */
export function pickGroup(embedding: Float32Array): GroupKey {
  let best: GroupKey = "other";
  let bestScore = -Infinity;
  for (const [key, c] of CENTROIDS) {
    let s = 0;
    for (let i = 0; i < c.length; i++) s += c[i] * embedding[i];
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return best;
}

/** Frames of one animation, as one picture. */
export function meanOf(embeddings: Float32Array[]): Float32Array {
  const sum = new Float32Array(MODEL.dims);
  for (const e of embeddings)
    for (let i = 0; i < sum.length; i++) sum[i] += e[i];
  return unit(sum);
}
