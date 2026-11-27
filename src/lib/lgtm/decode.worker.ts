/// <reference lib="webworker" />
// Decodes a picture, fits it within MAX_SIDE and stamps LGTM on every frame,
// streaming each frame to the encoder while making the next.
import { MAX_SIDE } from "#lib/limits.js";

import lgtmUrl from "../assets/lgtm.webp?url";
import { ConvertError } from "./errors";
import { loadHeif } from "./heif";
import type { Ack, Connect, Job, ToEncoder } from "./protocol";
import { type Format, sniff } from "./sniff";
import { loadWasm } from "./wasm";

/** Frames sent but not yet taken; about 1MB each, so a long GIF must wait. */
const WINDOW = 4;

let port: MessagePort | undefined;
let inFlight = 0;
let freed: (() => void) | undefined;

const send = (msg: ToEncoder, transfer: Transferable[] = []) =>
  port?.postMessage(msg, transfer);

async function sendFrame(
  id: number,
  rgba: Uint8Array<ArrayBuffer>,
  duration: number,
) {
  while (inFlight >= WINDOW) await new Promise<void>((r) => (freed = r));
  inFlight += 1;
  send({ type: "frame", id, rgba: rgba.buffer, duration }, [rgba.buffer]);
}

let lgtm: Promise<ImageBitmap> | undefined;
const loadLgtm = () => {
  lgtm ??= fetch(lgtmUrl)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b));
  return lgtm;
};

/** Fits the source within MAX_SIDE and draws the mark on top. */
class Stamper {
  readonly width: number;
  readonly height: number;
  #ctx: OffscreenCanvasRenderingContext2D;
  #mark: ImageBitmap;

  constructor(srcWidth: number, srcHeight: number, mark: ImageBitmap) {
    const scale = Math.min(1, MAX_SIDE / srcWidth, MAX_SIDE / srcHeight);
    this.width = Math.max(1, Math.round(srcWidth * scale));
    this.height = Math.max(1, Math.round(srcHeight * scale));
    this.#ctx = context2d(this.width, this.height, true);
    this.#ctx.imageSmoothingQuality = "high";
    this.#mark = mark;
  }

  stamp(source: CanvasImageSource): Uint8Array<ArrayBuffer> {
    const { width, height } = this;
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    // Contained and centred, as sharp's resize(fit: "contain") did.
    const mark = this.#mark;
    const k = Math.min(width / mark.width, height / mark.height);
    const w = mark.width * k;
    const h = mark.height * k;
    ctx.drawImage(mark, (width - w) / 2, (height - h) / 2, w, h);
    const { data } = ctx.getImageData(0, 0, width, height);
    return new Uint8Array(data.buffer);
  }
}

function context2d(w: number, h: number, willReadFrequently = false) {
  const ctx = new OffscreenCanvas(w, h).getContext("2d", {
    willReadFrequently,
  });
  if (!ctx) throw new ConvertError("failed", "", "no 2d context");
  return ctx;
}

async function begin(
  id: number,
  width: number,
  height: number,
  frames: number,
) {
  const stamper = new Stamper(width, height, await loadLgtm());
  send({
    type: "begin",
    id,
    width: stamper.width,
    height: stamper.height,
    frames,
  });
  return stamper;
}

/** GIF and animated WebP: giflib and libwebp, one frame at a time. */
async function convertAnimated(id: number, bytes: Uint8Array, format: Format) {
  const wasm = await loadWasm();
  const dec =
    format === "gif" ? new wasm.GifDecoder(bytes) : new wasm.WebPDecoder(bytes);
  try {
    if (!dec.ok()) throw new ConvertError("corrupt", "", "undecodable image");
    const width = dec.width();
    const height = dec.height();
    const stamper = await begin(id, width, height, dec.frameCount());
    const ctx = context2d(width, height);
    for (let f = dec.next(); f; f = dec.next()) {
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(f.data.buffer), width, height),
        0,
        0,
      );
      await sendFrame(id, stamper.stamp(ctx.canvas), f.duration);
    }
  } finally {
    dec.delete();
  }
}

/** HEIC: libheif, since only Safari decodes it natively. */
async function convertHeif(id: number, file: Blob, bytes: Uint8Array) {
  const heif = await loadHeif();
  const dec = new heif.HeifDecoder(bytes);
  let picture: { rgba: Uint8Array<ArrayBuffer>; width: number; height: number };
  try {
    // libheif here reads HEVC only; anything else is left to the browser.
    if (!dec.ok()) return convertStill(id, file, "heif");
    picture = { rgba: dec.rgba(), width: dec.width(), height: dec.height() };
  } finally {
    // Freed before stamping: a 48MP photo is about 200MB of RGBA.
    dec.delete();
  }
  const { rgba, width, height } = picture;
  const stamper = await begin(id, width, height, 1);
  const ctx = context2d(width, height);
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.buffer), width, height),
    0,
    0,
  );
  await sendFrame(id, stamper.stamp(ctx.canvas), 0);
}

/** Everything else: the browser's decoder, which also applies EXIF rotation. */
async function convertStill(id: number, file: Blob, format: Format | null) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    // A known format failing to decode is a broken file; AVIF only decodes
    // where the browser supports it.
    const known = format !== null && format !== "avif";
    throw new ConvertError(known ? "corrupt" : "unsupported", "", String(e));
  }
  try {
    const stamper = await begin(id, bitmap.width, bitmap.height, 1);
    await sendFrame(id, stamper.stamp(bitmap), 0);
  } finally {
    bitmap.close();
  }
}

async function convert({ id, file }: Job) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniff(bytes);
  if (format === "gif" || format === "webp-animated")
    await convertAnimated(id, bytes, format);
  else if (format === "heif") await convertHeif(id, file, bytes);
  else await convertStill(id, file, format);
  send({ type: "end", id });
}

// One job at a time, in order.
let queue = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<Connect | Job>) => {
  if (data.type === "connect") {
    port = data.port;
    port.onmessage = ({ data: ack }: MessageEvent<Ack>) => {
      if (ack.type !== "ack") return;
      inFlight -= 1;
      freed?.();
      freed = undefined;
    };
    return;
  }
  queue = queue.then(() =>
    convert(data).catch((e) =>
      send({
        type: "fail",
        id: data.id,
        kind: e instanceof ConvertError ? e.kind : "failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    ),
  );
};
