import { posix } from "node:path";
import { fileURLToPath } from "node:url";

import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

const CLIP_WORKER = 'new URL("./clip.worker.ts", import.meta.url)';
const PLACEHOLDER = "__LGTM_CLIP_WORKER__";

/**
 * Bundles clip.worker.ts into the server build as a chunk of its own and
 * points infer.ts at it. Vite does this for the browser's workers only; left
 * alone, the URL names a .ts file the build does not have.
 */
function serverWorker(): Plugin {
  let ref: string | undefined;
  return {
    name: "lgtm:server-worker",
    apply: "build",
    applyToEnvironment: (env) => env.name === "ssr",
    transform(code, id) {
      if (!id.endsWith("/src/lib/server/groups/infer.ts")) return;
      if (!code.includes(CLIP_WORKER))
        this.error(`infer.ts no longer says ${CLIP_WORKER}`);
      ref = this.emitFile({
        type: "chunk",
        id: fileURLToPath(
          new URL("src/lib/server/groups/clip.worker.ts", import.meta.url),
        ),
        fileName: "clip.worker.js",
      });
      // Within one line, so the lines still map without a new source map.
      return {
        code: code.replace(
          CLIP_WORKER,
          `new URL("${PLACEHOLDER}", import.meta.url)`,
        ),
        map: null,
      };
    },
    // Relative to the chunk that starts it. Vite's own file URLs start from
    // the site's base path, which means nothing to a Worker.
    renderChunk(code, chunk) {
      if (!ref || !code.includes(PLACEHOLDER)) return;
      const to = posix.relative(
        posix.dirname(chunk.fileName),
        this.getFileName(ref),
      );
      return {
        code: code.replace(PLACEHOLDER, to.startsWith(".") ? to : `./${to}`),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    serverWorker(),
    sveltekit({
      adapter: adapter(),
      version: {
        // The commit, so every rollout has its own version.json.
        name: process.env.APP_VERSION || undefined,
        // Open tabs notice a deploy before a navigation fails.
        pollInterval: 60_000,
      },
    }),
  ],
  server: {
    host: true,
  },
  ssr: {
    external: ["bun:sqlite", "onnxruntime-node"],
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"],
  },
});
