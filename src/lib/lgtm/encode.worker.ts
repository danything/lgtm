/// <reference lib="webworker" />
/**
 * Second half of turning a picture into an LGTM image: libwebp (wasm) takes
 * the stamped frames one by one as the decoding worker sends them, and the
 * finished (animated) WebP goes back to the page.
 */
import type { Ack, Connect, Result, ToEncoder } from "./protocol";
import type { Encoder } from "./vendor/lgtm-wasm.js";
import { loadWasm } from "./wasm";

/** What sharp was asked for before; keeps new uploads looking like old ones. */
const QUALITY = 80;

let port: MessagePort | undefined;
const jobs = new Map<number, { encoder?: Encoder; error?: string }>();

const reply = (result: Result) =>
	result.ok
		? self.postMessage(result, [result.webp.buffer])
		: self.postMessage(result);

async function handle(msg: ToEncoder) {
	switch (msg.type) {
		case "begin": {
			const wasm = await loadWasm();
			jobs.set(msg.id, {
				encoder: new wasm.Encoder(msg.width, msg.height, QUALITY),
			});
			return;
		}
		case "frame": {
			const job = jobs.get(msg.id);
			// A failed frame poisons the job, but the rest are still taken and
			// acknowledged so the decoder is never left waiting.
			if (job?.encoder && !job.error) {
				if (!job.encoder.add(new Uint8Array(msg.rgba), msg.duration))
					job.error = "encode failed";
			}
			port?.postMessage({ type: "ack" } satisfies Ack);
			return;
		}
		case "end": {
			const job = jobs.get(msg.id);
			jobs.delete(msg.id);
			const webp = job?.error ? null : job?.encoder?.finish();
			job?.encoder?.delete();
			reply(
				webp
					? { id: msg.id, ok: true, webp }
					: { id: msg.id, ok: false, error: job?.error ?? "encode failed" },
			);
			return;
		}
		case "fail": {
			jobs.get(msg.id)?.encoder?.delete();
			jobs.delete(msg.id);
			reply({ id: msg.id, ok: false, error: msg.error });
			return;
		}
	}
}

// Messages strictly in order: "begin" waits for the wasm to load, and the
// frames behind it must not overtake it.
let queue = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<Connect>) => {
	if (data.type !== "connect") return;
	port = data.port;
	// Start fetching the wasm now rather than on the first frame.
	void loadWasm();
	port.onmessage = ({ data: msg }: MessageEvent<ToEncoder>) => {
		queue = queue.then(() =>
			handle(msg).catch((e) =>
				reply({
					id: msg.id,
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				}),
			),
		);
	};
};
