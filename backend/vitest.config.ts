import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // One in-memory MongoDB per run rather than one per worker: faster, and
    // avoids several servers racing for ports.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
