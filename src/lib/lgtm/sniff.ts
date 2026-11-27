/** What a picture is, read from its first bytes rather than its name. */
export type Format =
  | "gif"
  | "webp"
  | "webp-animated"
  | "png"
  | "jpeg"
  | "avif"
  | "heif"
  | "bmp"
  | "svg";

const ascii = (b: Uint8Array, at: number, n = 4) =>
  String.fromCharCode(...b.subarray(at, at + n));

// ISO-BMFF brands. HEIF stills from phones are heic/heix, Apple's mif1 too.
const AVIF = new Set(["avif", "avis"]);
const HEIF = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);

function isoBrand(b: Uint8Array): "avif" | "heif" | null {
  if (b.length < 16 || ascii(b, 4) !== "ftyp") return null;
  const end = Math.min(
    b.length,
    new DataView(b.buffer, b.byteOffset).getUint32(0),
  );
  // The major brand, then the compatible ones; AVIF also lists mif1.
  const brands: string[] = [ascii(b, 8)];
  for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(b, at));
  if (brands.some((x) => AVIF.has(x))) return "avif";
  if (brands.some((x) => HEIF.has(x))) return "heif";
  return null;
}

export function sniff(b: Uint8Array): Format | null {
  if (ascii(b, 0) === "GIF8") return "gif";
  if (ascii(b, 0) === "RIFF" && ascii(b, 8) === "WEBP")
    return ascii(b, 12) === "VP8X" && (b[20] & 0x02) !== 0
      ? "webp-animated"
      : "webp";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (ascii(b, 0, 2) === "BM") return "bmp";
  const brand = isoBrand(b);
  if (brand) return brand;
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart();
  if (
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"))
  )
    return "svg";
  return null;
}
