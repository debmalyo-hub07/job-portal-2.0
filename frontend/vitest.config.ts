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
    /**
     * The suite must not depend on a developer's `.env.local`, which is
     * gitignored and therefore absent on CI. `apiClient.ts` throws at import
     * when `VITE_API_URL` is unset — deliberately, because a silent fallback to
     * the page origin is the worse failure — so without this every test file
     * that reaches a component importing it dies during collection, with no
     * test having run. Ten of them did, and the suite was green locally the
     * whole time.
     *
     * The value is a placeholder, never contacted: jsdom issues no real
     * requests and every test that exercises a call mocks `apiClient` itself.
     * It exists so import-time evaluation succeeds, not to point anywhere.
     */
    env: {
      VITE_API_URL: "http://localhost:8000/api/v1",
      /**
       * Pinned empty so the suite's Turnstile branch is a decision rather than an
       * accident of whose machine it runs on. Vitest loads `.env.local` the same
       * way the dev server does, so a developer holding a site key in theirs was
       * running seven auth tests down a different branch than CI: they assert
       * two-argument `apiClient.post` calls, and an enabled challenge adds a
       * third.
       *
       * The enabled branch — the only one a production build permits — is covered
       * by `tests/turnstileAuth.test.tsx`, which opts in explicitly instead of
       * inheriting whatever happens to be on disk.
       */
      VITE_TURNSTILE_SITE_KEY: "",
    },
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
