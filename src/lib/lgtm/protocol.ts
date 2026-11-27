// Page -> decoder -> (MessageChannel) -> encoder -> page. The decoder streams
// frames so encoding one overlaps with preparing the next.
import type { FailKind } from "./errors";

/** Page -> either worker, once: its end of the channel to the other. */
export type Connect = { type: "connect"; port: MessagePort };
/** Page -> decoder: one picture to convert. */
export type Job = { type: "job"; id: number; file: Blob };

/** Decoder -> encoder. */
export type ToEncoder =
  | { type: "begin"; id: number; width: number; height: number; frames: number }
  | { type: "frame"; id: number; rgba: ArrayBuffer; duration: number }
  | { type: "end"; id: number }
  | { type: "fail"; id: number; kind: FailKind; error: string };
/** Encoder -> decoder: one frame taken off the queue (backpressure). */
export type Ack = { type: "ack" };

/** Encoder -> page. */
export type FromEncoder =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "result"; id: number; ok: true; webp: Uint8Array<ArrayBuffer> }
  | { type: "result"; id: number; ok: false; kind: FailKind; error: string };
export type Result = Extract<FromEncoder, { type: "result" }>;
