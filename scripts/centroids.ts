// Writes src/lib/server/groups/centroids.json: each group's prompts through
// CLIP's text tower, averaged. Only the image tower ships, so rerun this after
// changing a prompt. transformers.js is not a dependency; in a throwaway
// container: bun add --no-save @huggingface/transformers@4.3.2 && bun scripts/centroids.ts
import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
} from "@huggingface/transformers";

import { MODEL } from "../src/lib/server/groups/clip";

// English, as CLIP was trained on; the page shows the Japanese names.
const PROMPTS = {
  person: [
    "a photo of a person",
    "a selfie of a young woman",
    "a photo of a group of people",
    "a photo of a cosplayer",
    "a photo of a singer on stage",
    // Animal ears went to 猫 without this.
    "a photo of a girl wearing cat ears",
    "a photo of a person holding a drink",
  ],
  food: [
    "a photo of food",
    "a photo of a bowl of ramen",
    "a photo of a meal on a plate",
    "a photo of snacks",
  ],
  anime: [
    "an anime illustration",
    "a cartoon drawing",
    "a manga panel",
    "a screenshot of an anime",
  ],
  screen: [
    "a screenshot of a phone app",
    "a poster with lots of text",
    "an event flyer",
    "a screenshot of text",
    "a music player screen",
  ],
  cat: ["a photo of a cat, a pet animal", "a photo of a kitten"],
  dog: ["a photo of a dog, a pet animal", "a photo of a puppy"],
  animal: ["a photo of a wild animal", "a photo of a bird"],
  other: [
    "a photo of an object",
    "a photo of a landscape",
    "a photo of a building",
    "a photo of a car",
    "a photo of a toy",
  ],
};

const tokenizer = await AutoTokenizer.from_pretrained(MODEL.repo);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL.repo, {
  revision: MODEL.revision,
  dtype: "q8",
});
const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const out: Record<string, number[]> = {};
for (const [group, prompts] of Object.entries(PROMPTS)) {
  const sum = Array.from({ length: MODEL.dims }, () => 0);
  for (const prompt of prompts) {
    const { text_embeds } = await model(
      tokenizer([prompt], { padding: true, truncation: true }),
    );
    unit(Array.from(text_embeds.data as Float32Array)).forEach(
      (x, i) => (sum[i] += x),
    );
  }
  out[group] = unit(sum).map((x) => Math.round(x * 1e6) / 1e6);
}
await Bun.write(
  new URL("../src/lib/server/groups/centroids.json", import.meta.url),
  JSON.stringify(out) + "\n",
);
