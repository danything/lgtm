// The main thread's side of clip.worker.ts: hands it a picture and waits for
// the embedding. One worker, started on first use and kept; the model is read
// once in it. A worker that dies is replaced on the next call, and the
// server's shutdown stops it.
import { resolve } from "node:path";

import type { Reply, Request, Start } from "./clip.worker";

// Bun's Worker; the DOM's type, which wins here, has no ref() or unref().
type BunWorker = Worker & { ref(): void; unref(): void };

type Running = {
  worker: BunWorker;
  pending: Map<
    number,
    { resolve: (e: Float32Array) => void; reject: (e: Error) => void }
  >;
};

let script: string | URL = new URL("./clip.worker.ts", import.meta.url);
let running: Running | undefined;
let nextId = 0;

/** For tests: a stand-in for clip.worker.ts. */
export function useWorkerScript(url: string | URL): void {
  stopWorker();
  script = url;
}

function start(mark: Uint8Array): Running {
  const worker = new Worker(script) as BunWorker;
  const me: Running = { worker, pending: new Map() };
  // Idle, it does not keep the process up; waited on, it does.
  worker.unref();
  const fail = (why: string) => {
    if (running === me) running = undefined;
    for (const p of me.pending.values())
      p.reject(new Error(`the CLIP worker stopped: ${why}`));
    me.pending.clear();
    worker.terminate();
  };
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const p = me.pending.get(data.id);
    if (!p) return;
    me.pending.delete(data.id);
    if (me.pending.size === 0) worker.unref();
    if ("embedding" in data) p.resolve(data.embedding);
    else p.reject(Object.assign(new Error(data.error.message), data.error));
  };
  worker.addEventListener("error", (e) => fail(e.message));
  worker.addEventListener("close", () => fail("it exited"));
  // Relative to the working directory, as before.
  const dir = resolve(process.env.MODEL_DIR ?? "model");
  worker.postMessage({ dir, mark } satisfies Start);
  return me;
}

/**
 * The picture's unit-length embedding, worked out in the worker. `mark` is the
 * LGTM mark as a WebP; the worker keeps the one it was started with.
 */
export function embedInWorker(
  webp: Uint8Array,
  mark: Uint8Array,
): Promise<Float32Array> {
  running ??= start(mark);
  const { worker, pending } = running;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.ref();
    // Copied, not moved: the caller may still hold it.
    worker.postMessage({ id, webp } satisfies Request);
  });
}

/** Stops the worker; calls still waiting are rejected. */
export function stopWorker(): void {
  const me = running;
  running = undefined;
  if (!me) return;
  for (const p of me.pending.values())
    p.reject(new Error("the CLIP worker was stopped"));
  me.pending.clear();
  me.worker.terminate();
}

// adapter-bun emits this once requests have drained, and leaves the exit to
// the event loop running dry.
(process as NodeJS.EventEmitter).on("sveltekit:shutdown", stopWorker);
