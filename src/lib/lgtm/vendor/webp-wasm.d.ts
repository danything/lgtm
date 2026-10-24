// Types for webp-wasm.js beside this file: the Emscripten module built by
// scripts/build-webp-wasm.sh (wasm-webp's bindings over libwebp, with SIMD).
// Called with locateFile so the .wasm is fetched from the URL Vite gives it.
type Config = { lossless: number; quality: number };
type AnimationFrame = {
	duration: number;
	data: Uint8Array;
	config: Config;
	has_config: boolean;
};
type FrameVector = {
	push_back(frame: AnimationFrame): void;
	delete(): void;
};
export type WebPModule = {
	VectorWebPAnimationFrame: new () => FrameVector;
	encode(
		data: Uint8Array,
		width: number,
		height: number,
		hasAlpha: boolean,
		config: Config,
	): Uint8Array | null;
	encodeAnimation(
		width: number,
		height: number,
		hasAlpha: boolean,
		frames: FrameVector,
	): Uint8Array | null;
	decodeAnimation(
		data: Uint8Array,
		hasAlpha: boolean,
	):
		| { data: Uint8Array; width: number; height: number; duration: number }[]
		| null;
};
declare const factory: (options?: {
	locateFile?: (path: string) => string;
}) => Promise<WebPModule>;
export default factory;
