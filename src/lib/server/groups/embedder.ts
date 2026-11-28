// A picture's embedding from CLIP's image tower, in onnxruntime's native build.
// It runs in clip.worker.ts: in Bun, onnxruntime-node holds the thread that
// calls run() for the whole inference. `dir` holds vision.onnx and
// webp-node.wasm.
import type { Decoder } from "#lib/lgtm/vendor/lgtm-wasm.js";

import { modelInput, type Rgba, SIZE } from "./pixels";
import { meanOf, unit } from "./score";

/** An animation is judged by this many frames, spread over it. */
const FRAMES = 3;

export type Embed = (webp: Uint8Array) => Promise<Float32Array>;

class ModelUnavailable extends Error {
  override name = "ModelUnavailable";
}

/** Reads the model once; `markWebp` is the LGTM mark the stamper puts on. */
export async function loadEmbedder(
  dir: string,
  markWebp: Uint8Array,
): Promise<Embed> {
  const { ort, session, decode, mark } = await (async () => {
    // Its Linux build reports usage to Microsoft otherwise (the image sets it too).
    process.env.ORT_DISABLE_TELEMETRY ??= "1";
    const ort = await import("onnxruntime-node");
    // One thread: grouping waits, page requests should not.
    const session = await ort.InferenceSession.create(`${dir}/vision.onnx`, {
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
    });
    const { default: factory } = await import("#lib/lgtm/vendor/webp-node.js");
    const wasm = await factory({ locateFile: (f) => `${dir}/${f}` });
    const decode = (bytes: Uint8Array) => new wasm.WebPDecoder(bytes);
    const [mark] = frames(decode(markWebp), 1);
    return { ort, session, decode, mark };
  })().catch((e) => {
    throw new ModelUnavailable((e as Error).message);
  });

  /** The picture's unit-length embedding, frames averaged. */
  return async (webp) => {
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
  };
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
    const last = Math.max(...want);
    const out: Rgba[] = [];
    for (let i = 0; i <= last; i++) {
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
