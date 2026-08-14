import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// __dirname does not exist in ESM; derive it from import.meta.url instead.
const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Refuses to produce a bundle that cannot reach the API.
 *
 * `src/lib/apiClient.ts` throws at import when `VITE_API_URL` is missing. That
 * is right in a browser and pathological at build time: the value is inlined as
 * a literal, so Rolldown proves the throw always fires, treats everything after
 * it as unreachable, and tree-shakes the entire application away. The build
 * then **succeeds** — measured at 275 kB against a real 874 kB, containing no
 * route, no page and no component. It satisfies a file-exists check and a
 * hashed-chunk grep, and it serves a blank page with a clean console.
 *
 * That is precisely what a host deploys when nobody set its environment
 * variables, so it has to fail here instead of shipping quietly. Only `build`
 * is gated: `vite dev` reads `.env.local`, and vitest supplies the value
 * through `test.env`.
 */
function requireApiUrl() {
  return {
    name: "require-vite-api-url",
    apply: "build",
    config(_config, { mode }) {
      // Reads .env files the way Vite itself will, so this agrees with the value
      // the build would actually inline rather than guessing from process.env,
      // which would miss .env.production entirely.
      const env = loadEnv(mode, dirname, "VITE_");
      if (!env.VITE_API_URL) {
        throw new Error(
          "VITE_API_URL is not set, so this build would tree-shake the whole " +
            "application into an empty bundle that renders a blank page. Set it " +
            "in the host's environment (Vercel -> Settings -> Environment " +
            "Variables) or in frontend/.env.local for a local build.",
        );
      }
      if (!env.VITE_TURNSTILE_SITE_KEY) {
        throw new Error(
          "VITE_TURNSTILE_SITE_KEY is not set. Production auth requires the " +
            "public Cloudflare Turnstile site key (Vercel -> Settings -> " +
            "Environment Variables).",
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [requireApiUrl(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Don't auto-bump to 5174/5175 when 5173 is held by an orphaned dev process.
    // The sharp failure is the signal that tells the developer to Ctrl+C the
    // prior terminal; quietly hopping to a new port leaves three stale servers
    // running and every one of them half-valid.
    strictPort: true,
  },
});
