// Types for lgtm-wasm.js beside this file, built by scripts/build-wasm.sh from
// wasm/lgtm.cpp. Written by hand: keep in step with the bindings there.
// Every object made here lives in the wasm heap and must be delete()d.

/** One whole canvas of RGBA, and how long it shows in milliseconds. */
export type DecodedFrame = { data: Uint8Array<ArrayBuffer>; duration: number };

type Disposable = { delete(): void };

/** Lossy WebP, fed one RGBA frame at a time; one frame makes a still image. */
export type Encoder = Disposable & {
	add(rgba: Uint8Array, duration: number): boolean;
	finish(): Uint8Array<ArrayBuffer> | null;
};

/** GIF or animated WebP, handed out one finished frame at a time. */
export type Decoder = Disposable & {
	ok(): boolean;
	width(): number;
	height(): number;
	frameCount(): number;
	next(): DecodedFrame | null;
};

export type LgtmWasm = {
	Encoder: new (width: number, height: number, quality: number) => Encoder;
	GifDecoder: new (bytes: Uint8Array) => Decoder;
	WebPDecoder: new (bytes: Uint8Array) => Decoder;
};

declare const factory: (options?: {
	locateFile?: (path: string) => string;
}) => Promise<LgtmWasm>;
export default factory;
