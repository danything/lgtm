/**
 * Width and height from a WebP header, or null when the bytes are not a whole
 * WebP. The first chunk is VP8X (extended), "VP8 " (lossy) or VP8L (lossless).
 */
export function webpSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  // The RIFF size covers everything after its own 8 bytes; a mismatch means
  // a truncated or padded upload.
  if (view.getUint32(4, true) + 8 !== bytes.length) return null;

  switch (tag(12)) {
    case "VP8X":
      return {
        width: 1 + (view.getUint32(24, true) & 0xffffff),
        height: 1 + (view.getUint32(27, true) & 0xffffff),
      };
    case "VP8 ":
      // Key frame start code, then 14-bit width and height.
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
        return null;
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    case "VP8L": {
      if (bytes[20] !== 0x2f) return null;
      const bits = view.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    default:
      return null;
  }
}

/** VP8X flag bits for the chunks stripMetadata drops. */
const EXIF_FLAG = 0x08;
const XMP_FLAG = 0x04;

/**
 * The same WebP without its EXIF and XMP chunks (location, camera), or null
 * when the chunks do not add up. Photos lose their metadata here at the latest.
 */
export function stripMetadata(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  const kept: Uint8Array[] = [];
  let dropped = false;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) return null;
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size % 2);
    if (end > bytes.length) return null;
    const name = tag(at);
    if (name === "EXIF" || name === "XMP ") dropped = true;
    else kept.push(bytes.subarray(at, end));
    at = end;
  }
  if (!dropped) return bytes;

  const body = kept.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(12 + body);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body, true);
  let at = 12;
  for (const chunk of kept) {
    out.set(chunk, at);
    at += chunk.length;
  }
  if (tag(12) === "VP8X") out[20] &= ~(EXIF_FLAG | XMP_FLAG);
  return out;
}
