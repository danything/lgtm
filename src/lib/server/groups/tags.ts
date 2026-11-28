import { MODEL } from "./clip";
// Search words for a picture, from the embedding grouping already stored: no
// model runs for this, and none runs when someone searches. Each tag's prompts
// were put through CLIP's text tower beforehand (scripts/tags.ts), as the
// groups' were; a picture gets the tags that stand out for it.
import tagData from "./tags.json";

/** Each tag's words: the one shown first, then other ways to write it. */
export const TAG_WORDS: readonly (readonly string[])[] = tagData.words;

const COUNT = TAG_WORDS.length;
// Tags CLIP sees in people too often (scripts/tag-vocabulary.ts): only the
// far-above rule puts them on.
const STRICT = new Set<number>(tagData.strict);
const VECTORS = (() => {
  const q = new Int8Array(Buffer.from(tagData.vectors, "base64").buffer);
  const out = new Float32Array(COUNT * MODEL.dims);
  for (let t = 0; t < COUNT; t++)
    for (let i = 0; i < MODEL.dims; i++)
      out[t * MODEL.dims + i] = q[t * MODEL.dims + i] * tagData.scales[t];
  return out;
})();

/** Each tag's cosine to the picture. */
export function cosines(e: Float32Array): Float32Array {
  const out = new Float32Array(COUNT);
  for (let t = 0; t < COUNT; t++) {
    let s = 0;
    for (let i = 0; i < MODEL.dims; i++)
      s += VECTORS[t * MODEL.dims + i] * e[i];
    out[t] = s;
  }
  return out;
}

/** How each tag scores across the pictures there are. */
export type TagStats = { mean: Float32Array; sd: Float32Array };

/** Sums cosines() picture by picture, so they need not all be kept. */
export class StatsBuilder {
  #n = 0;
  #sum = new Float64Array(COUNT);
  #sq = new Float64Array(COUNT);

  add(c: Float32Array): void {
    this.#n++;
    for (let t = 0; t < COUNT; t++) {
      this.#sum[t] += c[t];
      this.#sq[t] += c[t] * c[t];
    }
  }

  /** Undefined below two pictures, where there is no spread to measure. */
  done(): TagStats | undefined {
    const n = this.#n;
    if (n < 2) return undefined;
    const mean = new Float32Array(COUNT);
    const sd = new Float32Array(COUNT);
    for (let t = 0; t < COUNT; t++) {
      mean[t] = this.#sum[t] / n;
      sd[t] = Math.sqrt(Math.max(this.#sq[t] / n - mean[t] ** 2, 0)) || 1;
    }
    return { mean, sd };
  }
}

// CLIP's logit scale: the softmax over every tag says which fit best.
const LOGIT_SCALE = 100;
// A tag goes on when it is among the best for the picture and above its usual
// score, or far above its usual score though another tag fits better. The
// strict ones only the latter. Chosen
// by eye on the 1,650 pictures of 2026-11 (docs/model-comparison.md).
const SHARE = 0.02;
const ABOVE = 1;
const SHARE_WEAK = 0.002;
const FAR_ABOVE = 2.5;
const MAX_TAGS = 8;

export type Tag = { tag: string; score: number };

/**
 * The picture's tags, best first. The score is the tag's share of the
 * softmax, which search ranks by. Without stats (too few pictures yet) only
 * the share counts.
 */
export function pickTags(e: Float32Array, stats?: TagStats): Tag[] {
  const c = cosines(e);
  let max = -Infinity;
  for (const x of c) max = Math.max(max, x);
  const exp = c.map((x) => Math.exp(LOGIT_SCALE * (x - max)));
  const total = exp.reduce((a, b) => a + b, 0);
  const out: Tag[] = [];
  for (let t = 0; t < COUNT; t++) {
    const share = exp[t] / total;
    const above = stats ? (c[t] - stats.mean[t]) / stats.sd[t] : ABOVE;
    if (
      (!STRICT.has(t) && share >= SHARE && above >= ABOVE) ||
      (share >= SHARE_WEAK && above >= FAR_ABOVE)
    )
      out.push({ tag: TAG_WORDS[t][0], score: share });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_TAGS);
}

/** Width and case folded, katakana as hiragana: ネコ, ねこ and ﾈｺ are one. */
export function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .trim();
}

const FOLDED = TAG_WORDS.map((words) => words.map(fold));

/**
 * The tags a search means, one list per word of it (split on spaces); a
 * picture has to have a tag from every list. A word finds a tag that is
 * written that way, that starts with it (ラー finds ラーメン), or that it
 * contains (笑顔でピース finds 笑顔 and ピース). A single letter or kana only finds
 * its own tag, so 海 does not come up for 海老. A word that finds nothing
 * gives an empty list: nothing matches. A word that is a tag finds only
 * that tag (ねこ is 猫, not ねこみみ too).
 */
export function tagsFor(query: string): string[][] {
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((term) => {
      const where = (match: (w: string) => boolean) =>
        TAG_WORDS.flatMap((words, t) =>
          FOLDED[t].some(match) ? [words[0]] : [],
        );
      const exact = where((w) => w === term);
      return exact.length > 0
        ? exact
        : where(
            (w) =>
              (term.length >= 2 && w.startsWith(term)) ||
              (w.length >= 2 && term.includes(w)),
          );
    });
}

/** The tag's own direction: a picture that is nothing but it. For tests. */
export function vectorOf(word: string): Float32Array {
  const t = TAG_WORDS.findIndex((w) => w[0] === word);
  if (t < 0) throw new Error(`${word} is not a tag`);
  return VECTORS.slice(t * MODEL.dims, (t + 1) * MODEL.dims);
}
