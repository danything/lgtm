// CLIP's image tower in onnxruntime's native build, which runs off the JS
// thread. Loaded on first use; MODEL_DIR holds vision.onnx and webp-node.wasm.
import type { InferenceSession } from "onnxruntime-node";

import markUrl from "#lib/assets/lgtm.webp?inline";
import type { Decoder } from "#lib/lgtm/vendor/lgtm-wasm.js";

import { modelInput, type Rgba, SIZE } from "./pixels";
import { meanOf, unit } from "./score";

const DIR = process.env.MODEL_DIR ?? "model";
/** An animation is judged by this many frames, spread over it. */
const FRAMES = 3;

type Loaded = {
  ort: typeof import("onnxruntime-node");
  session: InferenceSession;
  decode: (bytes: Uint8Array) => Decoder;
  mark: Rgba;
};

let loaded: Promise<Loaded> | undefined;

class ModelUnavailable extends Error {
  override name = "ModelUnavailable";
}

function load(): Promise<Loaded> {
  loaded ??= (async () => {
    const ort = await import("onnxruntime-node");
    // One thread: grouping waits, page requests should not.
    const session = await ort.InferenceSession.create(`${DIR}/vision.onnx`, {
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
    });
    const { default: factory } = await import("#lib/lgtm/vendor/webp-node.js");
    const wasm = await factory({ locateFile: (f) => `${DIR}/${f}` });
    const decode = (bytes: Uint8Array) => new wasm.WebPDecoder(bytes);
    const markBytes = Buffer.from(markUrl.split(",")[1], "base64");
    const [mark] = frames(decode(markBytes), 1);
    return { ort, session, decode, mark };
  })().catch((e) => {
    throw new ModelUnavailable((e as Error).message);
  });
  return loaded;
}

/** Up to `count` frames, evenly spaced, starting with the first. */
function frames(dec: Decoder, count: number): Rgba[] {
  try {
    if (!dec.ok()) throw new Error("not a WebP");
    const width = dec.width();
    const height = dec.height();
    const total = Math.max(1, dec.frameCount());
    const want = new Set(
      Array.from({ length: Math.min(count, total) }, (_, i) =>
        Math.floor((i * total) / Math.min(count, total)),
      ),
    );
    const out: Rgba[] = [];
    for (let i = 0; i < total; i++) {
      const frame = dec.next();
      if (!frame) break;
      if (want.has(i)) out.push({ data: frame.data, width, height });
    }
    if (out.length === 0) throw new Error("no frames");
    return out;
  } finally {
    dec.delete();
  }
}

/** The picture's unit-length embedding, frames averaged. */
export async function embed(webp: Uint8Array): Promise<Float32Array> {
  const { ort, session, decode, mark } = await load();
  const out: Float32Array[] = [];
  for (const picture of frames(decode(webp), FRAMES)) {
    const input = new ort.Tensor("float32", modelInput(picture, mark), [
      1,
      3,
      SIZE,
      SIZE,
    ]);
    const { image_embeds } = await session.run({ pixel_values: input });
    out.push(unit(image_embeds.data as Float32Array));
  }
  return meanOf(out);
}
