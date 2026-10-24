/**
 * Width and height of a WebP file, read from its header alone, or null when
 * the bytes are not a well-formed WebP. Images arrive already converted by the
 * browser now, so the server no longer decodes them; this is what it checks
 * instead, and where the gallery gets each picture's proportions from.
 *
 * The first chunk says which of the three layouts follows: VP8X (extended:
 * animation, alpha), "VP8 " (plain lossy) or VP8L (plain lossless).
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
