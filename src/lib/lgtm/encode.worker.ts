/// <reference lib="webworker" />
// Encodes the stamped frames with libwebp as they arrive and hands the page
// progress and the finished WebP. Encoding is the slower half.
import type { FailKind } from "./errors";
import type { Ack, Connect, FromEncoder, ToEncoder } from "./protocol";
import type { Encoder } from "./vendor/lgtm-wasm.js";
import { loadWasm } from "./wasm";

/** What sharp used, so new uploads look like old ones. */
const QUALITY = 80;

let port: MessagePort | undefined;
const jobs = new Map<
  number,
  { encoder: Encoder; total: number; done: number; error?: string }
>();

const tell = (msg: FromEncoder) =>
  msg.type === "result" && msg.ok
    ? self.postMessage(msg, [msg.webp.buffer])
    : self.postMessage(msg);

const failed = (id: number, kind: FailKind, error: string) =>
  tell({ type: "result", id, ok: false, kind, error });

async function handle(msg: ToEncoder) {
  switch (msg.type) {
    case "begin": {
      const wasm = await loadWasm();
      jobs.set(msg.id, {
        encoder: new wasm.Encoder(msg.width, msg.height, QUALITY),
        total: msg.frames,
        done: 0,
      });
      return;
    }
    case "frame": {
      const job = jobs.get(msg.id);
      // A failed job still acks its frames so the decoder never stalls.
      if (job && !job.error) {
        if (!job.encoder.add(new Uint8Array(msg.rgba), msg.duration))
          job.error = "encode failed";
        job.done += 1;
        tell({
          type: "progress",
          id: msg.id,
          done: job.done,
          total: job.total,
        });
      }
      port?.postMessage({ type: "ack" } satisfies Ack);
      return;
    }
    case "end": {
      const job = jobs.get(msg.id);
      jobs.delete(msg.id);
      const webp = job && !job.error ? job.encoder.finish() : null;
      job?.encoder.delete();
      if (webp) tell({ type: "result", id: msg.id, ok: true, webp });
      else failed(msg.id, "failed", job?.error ?? "encode failed");
      return;
    }
    case "fail": {
      jobs.get(msg.id)?.encoder.delete();
      jobs.delete(msg.id);
      failed(msg.id, msg.kind, msg.error);
      return;
    }
  }
}

// Strictly in order: frames must not overtake the "begin" waiting on the wasm.
let queue = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<Connect>) => {
  if (data.type !== "connect") return;
  port = data.port;
  // Fetch the wasm now rather than on the first frame.
  void loadWasm();
  port.onmessage = ({ data: msg }: MessageEvent<ToEncoder>) => {
    queue = queue.then(() =>
      handle(msg).catch((e) =>
        failed(msg.id, "failed", e instanceof Error ? e.message : String(e)),
      ),
    );
  };
};
