// Types for heif-wasm.js, built from wasm/heif.cpp. Written by hand.

/** The primary image of a HEIF file, rotated as the file says. Must be delete()d. */
export type HeifDecoder = {
  ok(): boolean;
  width(): number;
  height(): number;
  /** Why it failed, when ok() is false. */
  error(): string;
  rgba(): Uint8Array<ArrayBuffer>;
  delete(): void;
};

export type HeifWasm = {
  HeifDecoder: new (bytes: Uint8Array) => HeifDecoder;
};

declare const factory: (options?: {
  locateFile?: (path: string) => string;
}) => Promise<HeifWasm>;
export default factory;
