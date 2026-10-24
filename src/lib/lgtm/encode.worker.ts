/// <reference lib="webworker" />
/**
 * Second half of turning a picture into an LGTM image: libwebp (wasm) takes
 * the stamped frames one by one as the decoding worker sends them, and the
 * finished (animated) WebP goes back to the page, with progress on the way.
 * Encoding is the slower half, so its pace is the one worth showing.
 */
import type { Ack, Connect, FromEncoder, ToEncoder } from "./protocol";
import type { Encoder } from "./vendor/lgtm-wasm.js";
import { loadWasm } from "./wasm";

/** What sharp was asked for before; keeps new uploads looking like old ones. */
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
			// A failed frame poisons the job, but the rest are still taken and
			// acknowledged so the decoder is never left waiting.
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
			tell(
				webp
					? { type: "result", id: msg.id, ok: true, webp }
					: {
							type: "result",
							id: msg.id,
							ok: false,
							error: job?.error ?? "encode failed",
						},
			);
			return;
		}
		case "fail": {
			jobs.get(msg.id)?.encoder.delete();
			jobs.delete(msg.id);
			tell({ type: "result", id: msg.id, ok: false, error: msg.error });
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
				tell({
					type: "result",
					id: msg.id,
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				}),
			),
		);
	};
};
