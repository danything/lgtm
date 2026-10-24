/**
 * The built app's image conversion, end to end in a real browser: the two
 * workers from src/lib/lgtm with the wasm built by the Dockerfile. Catches a
 * compiler (emsdk) or library update that still builds but no longer works,
 * which the image build alone would let through to an automerge.
 *
 * Runs against a running app, BASE_URL (default http://localhost:3000):
 *   bunx playwright test
 *
 * Signed out there is no upload button, so the workers are driven directly,
 * over the same messages makeLgtm sends (src/lib/lgtm/index.ts).
 */
import { expect, type Page, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * A two-frame animated GIF of w x h. The LZW data puts a clear code before
 * every two pixels, so the code size never grows past 3 bits and no real
 * compression is needed.
 */
function gif(w: number, h: number): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push(n & 0xff, n >> 8);
  out.push(...new TextEncoder().encode("GIF89a"));
  u16(w);
  u16(h);
  // Global colour table of 4 entries: red, green, blue, white.
  out.push(0x91, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255);
  out.push(0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"));
  out.push(3, 1, 0, 0, 0);
  for (let frame = 0; frame < 2; frame++) {
    out.push(0x21, 0xf9, 4, 0);
    u16(10); // 100ms
    out.push(0, 0);
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(w);
    u16(h);
    out.push(0);
    const codes: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (i % 2 === 0) codes.push(4); // clear
      codes.push((i + frame) % 4);
    }
    codes.push(5); // end of information
    const data: number[] = [];
    let acc = 0;
    let bits = 0;
    for (const c of codes) {
      acc |= c << bits;
      bits += 3;
      while (bits >= 8) {
        data.push(acc & 0xff);
        acc >>= 8;
        bits -= 8;
      }
    }
    if (bits > 0) data.push(acc & 0xff);
    out.push(2); // LZW minimum code size
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      out.push(block.length, ...block);
    }
    out.push(0);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}

type Converted = {
  head: string;
  anim: boolean;
  width: number;
  height: number;
  progress: number;
};

/**
 * Converts one picture in the page with the app's own workers and reads the
 * WebP back. `source` is GIF bytes, or a PNG of that size drawn in the page
 * (decoded by the browser rather than giflib).
 */
async function convert(
  page: Page,
  workers: { decode: string; encode: string },
  source: number[] | { png: [number, number] },
): Promise<Converted> {
  return page.evaluate(
    async ({ workers, source }) => {
      let file: Blob;
      if (Array.isArray(source)) {
        file = new Blob([new Uint8Array(source)], { type: "image/gif" });
      } else {
        const [w, h] = source.png;
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext("2d")!;
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#f80");
        grad.addColorStop(1, "#08f");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        file = await canvas.convertToBlob({ type: "image/png" });
      }
      const decoder = new Worker(workers.decode, { type: "module" });
      const encoder = new Worker(workers.encode, { type: "module" });
      try {
        const { port1, port2 } = new MessageChannel();
        decoder.postMessage({ type: "connect", port: port1 }, [port1]);
        encoder.postMessage({ type: "connect", port: port2 }, [port2]);
        let progress = 0;
        const webp = await new Promise<Uint8Array>((resolve, reject) => {
          const fail = (e: ErrorEvent) => reject(new Error(e.message));
          decoder.onerror = fail;
          encoder.onerror = fail;
          encoder.onmessage = ({ data }) => {
            if (data.type === "progress") progress = data.done;
            else if (data.ok) resolve(data.webp);
            else reject(new Error(data.error));
          };
          decoder.postMessage({ type: "job", id: 0, file });
        });
        const tag = (at: number) =>
          String.fromCharCode(...webp.subarray(at, at + 4));
        const bitmap = await createImageBitmap(
          new Blob([webp], { type: "image/webp" }),
        );
        return {
          head: `${tag(0)}....${tag(8)}`,
          anim: new TextDecoder("latin1").decode(webp).includes("ANIM"),
          width: bitmap.width,
          height: bitmap.height,
          progress,
        };
      } finally {
        decoder.terminate();
        encoder.terminate();
      }
    },
    {
      workers,
      source: source instanceof Uint8Array ? [...source] : source,
    },
  );
}

test("wasm converts a PNG and a GIF to WebP", async ({ page }) => {
  const errors: string[] = [];
  const wasm: number[] = [];
  const scripts: Promise<{ url: string; body: string }>[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("worker", (w) =>
    w.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    }),
  );
  page.on("requestfailed", (r) => errors.push(`${r.url()} failed`));
  page.on("response", (r) => {
    const url = r.url();
    if (url.endsWith(".wasm")) wasm.push(r.status());
    if (url.endsWith(".js") && r.ok())
      scripts.push(r.text().then((body) => ({ url, body })));
  });

  await page.goto(BASE_URL);
  await page.waitForLoadState("networkidle");

  // The worker URLs as the bundle names them; the layout's Upload pulls in
  // the chunk that holds them even when signed out.
  const find = (name: string, all: { url: string; body: string }[]) => {
    for (const { url, body } of all) {
      const m = body.match(
        new RegExp(`["'\`]([^"'\`]*${name}\\.worker-[\\w-]+\\.js)["'\`]`),
      );
      if (m) return new URL(m[1], url).href;
    }
    throw new Error(`${name} worker not found in the loaded scripts`);
  };
  const all = await Promise.all(scripts);
  const workers = { decode: find("decode", all), encode: find("encode", all) };

  // A PNG over 960px wide: decoded by the browser, fitted within 960px,
  // encoded by libwebp.
  const png = await convert(page, workers, { png: [1200, 600] });
  expect(png).toEqual({
    head: "RIFF....WEBP",
    anim: false,
    width: 960,
    height: 480,
    progress: 1,
  });

  // An animated GIF: decoded by giflib, encoded as an animated WebP.
  const anim = await convert(page, workers, gif(5, 3));
  expect(anim).toEqual({
    head: "RIFF....WEBP",
    anim: true,
    width: 5,
    height: 3,
    progress: 2,
  });

  expect(wasm.length).toBeGreaterThan(0);
  expect(wasm.every((s) => s === 200)).toBe(true);
  expect(errors).toEqual([]);
});
