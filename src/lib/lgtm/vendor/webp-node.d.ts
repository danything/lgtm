// Types for webp-node.js: wasm/lgtm.cpp built for the server, which only reads
// stored WebPs with it. Written by hand, as lgtm-wasm.d.ts.
import type { Decoder } from "./lgtm-wasm";

export type WebpNode = { WebPDecoder: new (bytes: Uint8Array) => Decoder };

declare const factory: (options?: {
  locateFile?: (path: string) => string;
}) => Promise<WebpNode>;
export default factory;
