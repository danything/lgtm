// libheif (wasm/heif.cpp), imported on first use so other uploads skip it.
import type { HeifWasm } from "./vendor/heif-wasm.js";

let instance: Promise<HeifWasm> | undefined;

export const loadHeif = () => {
  instance ??= Promise.all([
    import("./vendor/heif-wasm.js"),
    import("./vendor/heif-wasm.wasm?url"),
  ])
    .then(([{ default: factory }, { default: url }]) =>
      factory({ locateFile: () => url }),
    )
    .catch((e) => {
      // A dropped connection should not fail every later HEIC too.
      instance = undefined;
      throw e;
    });
  return instance;
};
