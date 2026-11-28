// embedder.ts in a Bun Worker, started by infer.ts. In Bun, onnxruntime-node
// holds the thread that calls run() for the whole inference (about 70ms a
// picture), and decoding a long animation can take longer; on the main thread
// every page request waited behind both. Here they hold only this thread.
//
// The first message says where the model is and what the mark looks like; the
// model is read from it once. Every message after is { id, webp } and is
// answered with the same id: { id, embedding } or { id, error }.
import { type Embed, loadEmbedder } from "./embedder";

declare const self: Worker;

export type Start = { dir: string; mark: Uint8Array };
export type Request = { id: number; webp: Uint8Array };
export type Reply =
  | { id: number; embedding: Float32Array }
  | { id: number; error: { name: string; message: string } };

let loaded: Promise<Embed> | undefined;

self.onmessage = async ({ data }: MessageEvent<Start | Request>) => {
  if ("dir" in data) {
    loaded ??= loadEmbedder(data.dir, data.mark);
    // Answered per request; this only keeps it from going unhandled.
    loaded.catch(() => {});
    return;
  }
  try {
    if (!loaded) throw new Error("the worker was not started");
    const embedding = await (await loaded)(data.webp);
    self.postMessage({ id: data.id, embedding } satisfies Reply, [
      embedding.buffer,
    ]);
  } catch (e) {
    // The name too: index.ts stops grouping on ModelUnavailable.
    const { name, message } = e as Error;
    self.postMessage({ id: data.id, error: { name, message } } satisfies Reply);
  }
};
