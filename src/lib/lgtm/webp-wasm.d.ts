// The Emscripten module inside wasm-webp. Its own wrapper (the package's main
// entry) calls this with no options, which leaves the .wasm to be fetched from
// next to the script -- a path the bundler does not know about. Importing the
// module directly lets locateFile point at the URL Vite gives the .wasm.
declare module "wasm-webp/dist/esm/webp-wasm.js" {
	type Config = { lossless: number; quality: number };
	type AnimationFrame = {
		duration: number;
		data: Uint8Array;
		config: Config;
		has_config: boolean;
	};
	export type WebPModule = {
		VectorWebPAnimationFrame: new () => {
			push_back(frame: AnimationFrame): void;
			delete(): void;
		};
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
			frames: InstanceType<WebPModule["VectorWebPAnimationFrame"]>,
		): Uint8Array | null;
		decodeAnimation(
			data: Uint8Array,
			hasAlpha: boolean,
		):
			| { data: Uint8Array; width: number; height: number; duration: number }[]
			| null;
	};
	const factory: (options?: {
		locateFile?: (path: string) => string;
	}) => Promise<WebPModule>;
	export default factory;
}
