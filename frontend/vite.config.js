import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// __dirname does not exist in ESM; derive it from import.meta.url instead.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
