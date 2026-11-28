// Writes src/lib/server/groups/tags.json: each tag's prompts (tag-vocabulary.ts)
// through CLIP's text tower, averaged. Pictures are tagged from their stored
// image embeddings, so rerun this after changing the vocabulary; the next
// start tags every picture again.
// transformers.js is not a dependency; in a throwaway container: bun add --no-save @huggingface/transformers@4.3.2 && bun scripts/tags.ts
import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
} from "@huggingface/transformers";

import { MODEL } from "../src/lib/server/groups/clip";
import { STRICT, TAGS } from "./tag-vocabulary";

const tokenizer = await AutoTokenizer.from_pretrained(MODEL.repo);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL.repo, {
  revision: MODEL.revision,
  dtype: "q8",
});
const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

for (const word of STRICT)
  if (!TAGS.some(([w]) => w === word))
    throw new Error(`${word} is strict but not in the vocabulary`);
const seen = new Set<string>();
// Int8 with one scale per tag: a tenth of the JSON as decimals, and the
// ranking does not move (cosines change by under 0.001).
const vectors = new Int8Array(TAGS.length * MODEL.dims);
const scales: number[] = [];
for (const [t, [word, , prompts]] of TAGS.entries()) {
  if (seen.has(word)) throw new Error(`${word} is in the vocabulary twice`);
  seen.add(word);
  const sum = Array.from({ length: MODEL.dims }, () => 0);
  for (const prompt of prompts) {
    const { text_embeds } = await model(
      tokenizer([prompt], { padding: true, truncation: true }),
    );
    unit(Array.from(text_embeds.data as Float32Array)).forEach(
      (x, i) => (sum[i] += x),
    );
  }
  const v = unit(sum);
  const scale = Math.max(...v.map(Math.abs)) / 127;
  scales.push(Math.round(scale * 1e9) / 1e9);
  v.forEach((x, i) => (vectors[t * MODEL.dims + i] = Math.round(x / scale)));
}

await Bun.write(
  new URL("../src/lib/server/groups/tags.json", import.meta.url),
  JSON.stringify({
    words: TAGS.map(([word, also]) => [word, ...also]),
    strict: TAGS.flatMap(([word], t) => (STRICT.has(word) ? [t] : [])),
    scales,
    vectors: Buffer.from(vectors.buffer).toString("base64"),
  }) + "\n",
);
