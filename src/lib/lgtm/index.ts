import type { Connect, Job, Result } from "./protocol";

/**
 * Converts each picture into an LGTM WebP in the browser, in order, and
 * answers with the results ready to upload. Fails as a whole if any one file
 * cannot be converted, as the server-side conversion did.
 *
 * Two workers form a pipeline: one decodes and stamps frames, the other
 * encodes them, so a long animation takes about as long as the slower of the
 * two rather than both added up. They, and the wasm they load, exist only for
 * the length of one batch.
 */
export async function makeLgtm(files: Blob[]): Promise<File[]> {
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
	encoder.onmessage = ({ data }: MessageEvent<Result>) =>
		pending.get(data.id)?.resolve(data);
	const crash = (e: ErrorEvent) => {
		for (const p of pending.values()) p.reject(new Error(e.message));
	};
	decoder.onerror = crash;
	encoder.onerror = crash;

	try {
		const out: File[] = [];
		for (const [id, file] of files.entries()) {
			const res = await new Promise<Result>((resolve, reject) => {
				pending.set(id, { resolve, reject });
				decoder.postMessage({ type: "job", id, file } satisfies Job);
			});
			pending.delete(id);
			if (!res.ok) throw new Error(res.error);
			out.push(new File([res.webp], "lgtm.webp", { type: "image/webp" }));
		}
		return out;
	} finally {
		decoder.terminate();
		encoder.terminate();
	}
}
