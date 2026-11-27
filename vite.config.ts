import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
