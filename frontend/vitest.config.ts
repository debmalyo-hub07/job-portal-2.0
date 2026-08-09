import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Playwright specs drive a real browser and must not run under jsdom.
    exclude: ["node_modules/**", "dist/**", "tests/visual/**"],
    /**
     * Capped deliberately. Vitest defaults to one fork per core, and a jsdom
     * environment carrying React, framer-motion and embla costs a few hundred
     * megabytes — so on a 12-core machine the suite tried to hold twelve of them
     * at once and started swapping. Tests that need about a second of
     * wall-clock then blew the 5s timeout, and *which* ones failed changed
     * between runs, which reads exactly like a flaky test rather than
     * contention. Raising the timeout would have hidden the thrash instead of
     * removing it.
     */
    maxWorkers: 4,
  },
});
