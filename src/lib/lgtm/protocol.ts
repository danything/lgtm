/**
 * Messages between the page and the two conversion workers. The decoding
 * worker reads and stamps frames and streams them straight to the encoding
 * worker over a MessageChannel, so encoding one frame overlaps with preparing
 * the next; the encoder answers the page with progress and the finished file.
 */

/** Page -> either worker, once: its end of the channel to the other. */
export type Connect = { type: "connect"; port: MessagePort };
/** Page -> decoder: one picture to convert. */
export type Job = { type: "job"; id: number; file: Blob };

/** Decoder -> encoder, over the channel. */
export type ToEncoder =
	| { type: "begin"; id: number; width: number; height: number; frames: number }
	| { type: "frame"; id: number; rgba: ArrayBuffer; duration: number }
	| { type: "end"; id: number }
	| { type: "fail"; id: number; error: string };
/** Encoder -> decoder: one frame taken off the queue (backpressure). */
export type Ack = { type: "ack" };

/** Encoder -> page. */
export type FromEncoder =
	| { type: "progress"; id: number; done: number; total: number }
	| { type: "result"; id: number; ok: true; webp: Uint8Array<ArrayBuffer> }
	| { type: "result"; id: number; ok: false; error: string };
export type Result = Extract<FromEncoder, { type: "result" }>;
