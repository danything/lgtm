import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES } from "#lib/limits.js";

import { ConvertError, UnsupportedBrowserError } from "./errors";
import type { Connect, FromEncoder, Job, Result } from "./protocol";

export {
  ConvertError,
  convertMessage,
  UnsupportedBrowserError,
} from "./errors";

/** A one-instruction wasm SIMD module; the codecs will not compile without SIMD. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

const supported = () =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof WebAssembly !== "undefined" &&
  WebAssembly.validate(SIMD_PROBE);

const nameOf = (file: Blob) => (file instanceof File ? file.name : "");

/**
 * Converts each picture into an LGTM WebP, in order, failing as a whole on the
 * first that cannot be. `onProgress` gets 0..1 across the batch. The two
 * workers (decode, encode) live for one batch.
 */
export async function makeLgtm(
  files: Blob[],
  onProgress?: (fraction: number) => void,
): Promise<File[]> {
  if (!supported()) throw new UnsupportedBrowserError();
  const big = files.find((f) => f.size > MAX_SOURCE_BYTES);
  if (big) throw new ConvertError("too-large", nameOf(big));

  const decoder = new Worker(new URL("./decode.worker.ts", import.meta.url), {
    type: "module",
  });
  const encoder = new Worker(new URL("./encode.worker.ts", import.meta.url), {
    type: "module",
  });
  const { port1, port2 } = new MessageChannel();
  decoder.postMessage({ type: "connect", port: port1 } satisfies Connect, [
    port1,
  ]);
  encoder.postMessage({ type: "connect", port: port2 } satisfies Connect, [
    port2,
  ]);

  const pending = new Map<
    number,
    { resolve: (r: Result) => void; reject: (e: Error) => void }
  >();
  encoder.onmessage = ({ data }: MessageEvent<FromEncoder>) => {
    if (data.type === "progress")
      onProgress?.((data.id + data.done / data.total) / files.length);
    else pending.get(data.id)?.resolve(data);
  };
  const crash = (e: ErrorEvent) => {
    for (const p of pending.values())
      p.reject(new ConvertError("failed", "", e.message));
  };
  decoder.onerror = crash;
  encoder.onerror = crash;

  try {
    const out: File[] = [];
    for (const [id, file] of files.entries()) {
      const res = await new Promise<Result>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        decoder.postMessage({ type: "job", id, file } satisfies Job);
      }).catch((e: ConvertError) => {
        throw new ConvertError(e.kind, nameOf(file), e.message);
      });
      pending.delete(id);
      if (!res.ok) throw new ConvertError(res.kind, nameOf(file), res.error);
      if (res.webp.length > MAX_UPLOAD_BYTES)
        throw new ConvertError("output-too-large", nameOf(file));
      out.push(new File([res.webp], "lgtm.webp", { type: "image/webp" }));
    }
    return out;
  } finally {
    decoder.terminate();
    encoder.terminate();
  }
}
