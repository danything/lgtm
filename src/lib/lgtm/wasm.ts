// libwebp + giflib with wasm SIMD; see scripts/build-wasm.sh and
// wasm/lgtm.cpp. Each worker that needs it loads its own instance.
import factory, { type LgtmWasm } from "./vendor/lgtm-wasm.js";
import wasmUrl from "./vendor/lgtm-wasm.wasm?url";

let instance: Promise<LgtmWasm> | undefined;

export const loadWasm = () => {
	instance ??= factory({ locateFile: () => wasmUrl });
	return instance;
};
