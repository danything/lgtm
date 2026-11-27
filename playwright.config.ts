import { defineConfig } from "@playwright/test";

// src/ holds the bun unit tests; only tests/ is for the browser.
export default defineConfig({ testDir: "tests" });
