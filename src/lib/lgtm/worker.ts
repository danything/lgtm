/// <reference lib="webworker" />
/**
 * Turns one picture into an LGTM image, off the main thread: decode it, fit it
 * within 960px, lay the LGTM mark over every frame, and encode the result as
 * (animated) WebP. This is what the server used to do with sharp.
 *
 * Decoding: GIFs with gifuct-js, animated WebP with libwebp (wasm), anything
 * else with the browser's own createImageBitmap -- which also honours the
 * EXIF orientation of a photo. Resizing and the overlay are plain canvas
 * drawing. Encoding is libwebp again.
 */
import { decompressFrames, parseGIF } from "gifuct-js";
import lgtmUrl from "../assets/lgtm.webp?url";
// libwebp built with wasm SIMD; see scripts/build-webp-wasm.sh.
import WebP, { type WebPModule } from "./vendor/webp-wasm.js";
import wasmUrl from "./vendor/webp-wasm.wasm?url";

/** Longest side of what gets stored. */
const MAX_SIDE = 960;
/** What sharp was asked for before; keeps new uploads looking like old ones. */
const QUALITY = 80;

export type Request = { id: number; file: Blob };
export type Response =
	| { id: number; ok: true; webp: Uint8Array<ArrayBuffer> }
	| { id: number; ok: false; error: string };

let webp: Promise<WebPModule> | undefined;
const loadWebP = () => {
	webp ??= WebP({ locateFile: () => wasmUrl });
	return webp;
};

let lgtm: Promise<ImageBitmap> | undefined;
const loadLgtm = () => {
	lgtm ??= fetch(lgtmUrl)
		.then((r) => r.blob())
		.then((b) => createImageBitmap(b));
	return lgtm;
};

/** One decoded frame at the source's own size, and how long it shows. */
type Frame = { source: CanvasImageSource; duration: number };

/**
 * Fits the source within MAX_SIDE, draws each frame with the mark on top, and
 * hands every result to `emit` as RGBA as soon as it is ready -- so a long
 * animation is never held in memory twice.
 */
class Stamper {
	readonly width: number;
	readonly height: number;
	#canvas: OffscreenCanvas;
	#ctx: OffscreenCanvasRenderingContext2D;
	#mark: ImageBitmap;

	constructor(srcWidth: number, srcHeight: number, mark: ImageBitmap) {
		const scale = Math.min(1, MAX_SIDE / srcWidth, MAX_SIDE / srcHeight);
		this.width = Math.max(1, Math.round(srcWidth * scale));
		this.height = Math.max(1, Math.round(srcHeight * scale));
		this.#canvas = new OffscreenCanvas(this.width, this.height);
		const ctx = this.#canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("no 2d context");
		ctx.imageSmoothingQuality = "high";
		this.#ctx = ctx;
		this.#mark = mark;
	}

	stamp(source: CanvasImageSource): Uint8Array {
		const { width, height } = this;
		const ctx = this.#ctx;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(source, 0, 0, width, height);
		// The mark is scaled to fit the picture and centred, keeping its own
		// proportions: what sharp's resize(fit: "contain") then composite did.
		const mark = this.#mark;
		const k = Math.min(width / mark.width, height / mark.height);
		const w = mark.width * k;
		const h = mark.height * k;
		ctx.drawImage(mark, (width - w) / 2, (height - h) / 2, w, h);
		const { data } = ctx.getImageData(0, 0, width, height);
		return new Uint8Array(data.buffer);
	}
}

const isGif = (b: Uint8Array) =>
	b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38; // "GIF8"

/** Extended-format WebP with the animation flag set in its VP8X header. */
const isAnimatedWebP = (b: Uint8Array) => {
	const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
	return (
		b.length > 21 &&
		tag(0) === "RIFF" &&
		tag(8) === "WEBP" &&
		tag(12) === "VP8X" &&
		(b[20] & 0x02) !== 0
	);
};

/**
 * Plays a GIF the way a browser does: each frame is a patch drawn over what
 * the last one left behind, and its disposal says what to clear afterwards.
 */
function* gifFrames(bytes: Uint8Array<ArrayBuffer>) {
	const gif = parseGIF(bytes.buffer);
	const width = gif.lsd.width;
	const height = gif.lsd.height;
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	const patch = new OffscreenCanvas(1, 1);
	const patchCtx = patch.getContext("2d");
	if (!ctx || !patchCtx) throw new Error("no 2d context");
	yield { width, height };
	for (const f of decompressFrames(gif, true)) {
		const { left, top, width: w, height: h } = f.dims;
		const before =
			f.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
		patch.width = w;
		patch.height = h;
		patchCtx.putImageData(
			new ImageData(new Uint8ClampedArray(f.patch), w, h),
			0,
			0,
		);
		// drawImage rather than putImageData so transparent pixels in the patch
		// leave the previous frame showing through, as they should.
		ctx.drawImage(patch, left, top);
		yield { source: canvas, duration: f.delay } satisfies Frame;
		if (f.disposalType === 2) ctx.clearRect(left, top, w, h);
		else if (before) ctx.putImageData(before, 0, 0);
	}
}

async function convert(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
	const [module, mark] = await Promise.all([loadWebP(), loadLgtm()]);
	const bytes = new Uint8Array(await file.arrayBuffer());
	const config = { lossless: 0, quality: QUALITY };

	let stamper: Stamper;
	const frames = new module.VectorWebPAnimationFrame();
	let count = 0;
	let single: Uint8Array | undefined;
	// Frames go straight into libwebp's own list as they are made, rather than
	// collecting in JS first: a 300-frame GIF is a few hundred MB of RGBA.
	const add = (rgba: Uint8Array, duration: number) => {
		count += 1;
		if (count === 1) single = rgba;
		frames.push_back({ data: rgba, duration, config, has_config: true });
	};

	try {
		if (isGif(bytes)) {
			const it = gifFrames(bytes);
			const head = it.next().value as { width: number; height: number };
			stamper = new Stamper(head.width, head.height, mark);
			for (const f of it) {
				const frame = f as Frame;
				add(stamper.stamp(frame.source), frame.duration);
			}
		} else if (isAnimatedWebP(bytes)) {
			const decoded = module.decodeAnimation(bytes, true);
			if (!decoded?.length) throw new Error("undecodable webp");
			const { width, height } = decoded[0];
			stamper = new Stamper(width, height, mark);
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("no 2d context");
			for (const f of decoded) {
				ctx.putImageData(
					new ImageData(new Uint8ClampedArray(f.data), f.width, f.height),
					0,
					0,
				);
				add(stamper.stamp(canvas), f.duration);
			}
		} else {
			const bitmap = await createImageBitmap(file);
			stamper = new Stamper(bitmap.width, bitmap.height, mark);
			add(stamper.stamp(bitmap), 0);
			bitmap.close();
		}

		const out =
			count === 1 && single
				? module.encode(single, stamper.width, stamper.height, true, config)
				: module.encodeAnimation(stamper.width, stamper.height, true, frames);
		if (!out) throw new Error("encode failed");
		// Copied out: the result is a view into wasm memory that the next
		// conversion may reuse.
		return out.slice();
	} finally {
		frames.delete();
	}
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
	try {
		const webp = await convert(data.file);
		self.postMessage({ id: data.id, ok: true, webp } satisfies Response, [
			webp.buffer,
		]);
	} catch (e) {
		self.postMessage({
			id: data.id,
			ok: false,
			error: e instanceof Error ? e.message : String(e),
		} satisfies Response);
	}
};
