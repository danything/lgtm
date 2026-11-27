// Helpers for the server tests (bun test). Not imported by the app.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh working directory with its own database and images folder. */
export function useScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lgtm-test-"));
  process.chdir(dir);
  process.env.DB_PATH = join(dir, "data", "lgtm.db");
  return dir;
}

/** A lossless WebP header of the given size, padded to look whole. */
export function webp(
  width: number,
  height: number,
  extra = 0,
): Uint8Array<ArrayBuffer> {
  const body = 4 + 8 + 5 + 9 + extra;
  const out = new Uint8Array(8 + body);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) =>
    [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, body, true);
  ascii(8, "WEBP");
  ascii(12, "VP8L");
  view.setUint32(16, out.length - 20, true);
  out[20] = 0x2f;
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return out;
}

export const webpFile = (width: number, height: number, extra = 0) =>
  new File([webp(width, height, extra)], "lgtm.webp", { type: "image/webp" });
