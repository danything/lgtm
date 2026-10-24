import type { Request, Response } from "./worker";

/**
 * Converts each picture into an LGTM WebP in the browser, in order, and
 * answers with the results ready to upload. Fails as a whole if any one file
 * cannot be converted, as the server-side conversion did.
 *
 * The worker, and the libwebp wasm it loads, exist only for the length of one
 * batch: nobody pays for them until they upload, and nothing is left holding
 * a few hundred MB of frames afterwards.
 */
export async function makeLgtm(files: Blob[]): Promise<File[]> {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
	});
	try {
		const out: File[] = [];
		for (const [id, file] of files.entries()) {
			const res = await new Promise<Response>((resolve, reject) => {
				worker.onmessage = ({ data }: MessageEvent<Response>) => resolve(data);
				worker.onerror = (e) => reject(new Error(e.message));
				worker.postMessage({ id, file } satisfies Request);
			});
			if (!res.ok) throw new Error(res.error);
			out.push(new File([res.webp], "lgtm.webp", { type: "image/webp" }));
		}
		return out;
	} finally {
		worker.terminate();
	}
}
