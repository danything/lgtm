import type { GroupKey, SceneKey } from "#lib/groups.js";

import centroids from "./centroids.json";
import { MODEL } from "./clip";
import sceneCentroids from "./scene-centroids.json";

const CENTROIDS = Object.entries(centroids) as [GroupKey, number[]][];

// Animal ears and plush toys scored as 猫 by a hair; the animals have to win
// clearly (on the 1,668 pictures then, 猫 went from 24 to 8, nearly all real).
const ANIMAL_HANDICAP = 0.01;
const ANIMALS: GroupKey[] = ["cat", "dog", "animal"];

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
    if (ANIMALS.includes(key)) s -= ANIMAL_HANDICAP;
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

// "rest/outdoor" and the like each keep their own prompt but share そのほか.
const SCENE_CENTROIDS = Object.entries(sceneCentroids).map(
  ([key, c]) => [key.split("/")[0] as SceneKey, c] as const,
);

/** Which kind of 人 picture: on stage, a selfie, with friends... */
export function pickScene(embedding: Float32Array): SceneKey {
  let best: SceneKey = "rest";
  let bestScore = -Infinity;
  for (const [key, c] of SCENE_CENTROIDS) {
    let s = 0;
    for (let i = 0; i < c.length; i++) s += c[i] * embedding[i];
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return best;
}

/**
 * The same shot uploaded again (or one a moment apart). On the 1,668 pictures
 * every pair at 0.97 looked the same; below it, poses and outfits differ.
 */
export const SAME_SHOT = 0.97;

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
