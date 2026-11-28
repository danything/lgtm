// A picture's embedding, for index.ts. The work is done in a worker
// (infer.ts, clip.worker.ts); this only adds the mark, which comes inlined
// from the build.
import markUrl from "#lib/assets/lgtm.webp?inline";

import { embedInWorker } from "./infer";

const mark = Buffer.from(markUrl.split(",")[1], "base64");

/** The picture's unit-length embedding, frames averaged. */
export const embed = (webp: Uint8Array): Promise<Float32Array> =>
  embedInWorker(webp, mark);
