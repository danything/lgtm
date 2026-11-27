// Writes src/lib/server/groups/centroids.json and scene-centroids.json: each
// group's (and each 人 scene's) prompts through CLIP's text tower, averaged.
// Only the image tower ships, so rerun this after changing a prompt.
// transformers.js is not a dependency; in a throwaway container: bun add --no-save @huggingface/transformers@4.3.2 && bun scripts/centroids.ts
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

// 人 split by scene. "rest/..." are kept apart and all land in そのほか: each
// was too small to be a row (outdoor 13, sports 11, work 1 of 1,135).
const SCENE_PROMPTS = {
  live: [
    "a photo of a performer on a concert stage",
    "a photo of an idol singing on stage under stage lights",
    "a photo of a live concert",
  ],
  selfie: [
    "a close-up selfie of a face",
    "a selfie taken with a phone",
    "a close-up portrait of a face",
    "a selfie of a girl in a frilly dress",
  ],
  group: [
    "a photo of two friends posing together",
    "a group photo of several people",
    "a photo of two girls side by side",
  ],
  pose: [
    "a person making a peace sign with fingers",
    "a person giving a thumbs up",
    "a person making a heart shape with hands",
  ],
  drink: [
    "a person eating food at a restaurant",
    "a person holding a drink in a cafe",
  ],
  outfit: [
    "a full body photo of a person standing, showing shoes",
    "a full body shot of the whole outfit from head to toe",
  ],
  "rest/outdoor": [
    "a person outdoors at a tourist spot",
    "a person sightseeing on a trip",
    "a person in nature",
  ],
  "rest/sports": ["a person playing sports"],
  "rest/work": [
    "a person working at an office",
    "a person in a business meeting",
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
async function centroids(all: Record<string, string[]>): Promise<string> {
  const out: Record<string, number[]> = {};
  for (const [key, prompts] of Object.entries(all)) {
    const sum = Array.from({ length: MODEL.dims }, () => 0);
    for (const prompt of prompts) {
      const { text_embeds } = await model(
        tokenizer([prompt], { padding: true, truncation: true }),
      );
      unit(Array.from(text_embeds.data as Float32Array)).forEach(
        (x, i) => (sum[i] += x),
      );
    }
    out[key] = unit(sum).map((x) => Math.round(x * 1e6) / 1e6);
  }
  return JSON.stringify(out) + "\n";
}

const dir = new URL("../src/lib/server/groups/", import.meta.url);
await Bun.write(new URL("centroids.json", dir), await centroids(PROMPTS));
await Bun.write(
  new URL("scene-centroids.json", dir),
  await centroids(SCENE_PROMPTS),
);
