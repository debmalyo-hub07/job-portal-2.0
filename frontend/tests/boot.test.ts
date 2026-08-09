import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import createWebStorage from "redux-persist/es/storage/createWebStorage";

const ROOT = resolve(__dirname, "..");

/**
 * These are boot-integrity tests. Every one of them corresponds to a defect that
 * produced a completely blank page with a clean network tab — the failure mode
 * that is hardest to diagnose and cheapest to catch here.
 */
describe("application boot", () => {
  it("createWebStorage resolves to a callable, not a CJS namespace object", () => {
    // The bug: `redux-persist/lib/storage/createWebStorage` is the CommonJS
    // build. Vite 8 (Rolldown) emits `export default require_createWebStorage()`,
    // which yields `{ __esModule: true, default: fn }`. Calling that threw
    // `createWebStorage is not a function` at import time, so store.ts never
    // finished evaluating and React never mounted.
    expect(typeof createWebStorage).toBe("function");

    const storage = createWebStorage("local");
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
  });

  it("imports redux-persist storage from the ESM build, never the CJS lib path", () => {
    const source = readFileSync(resolve(ROOT, "src/redux/store.ts"), "utf8");
    // Scoped to import statements only. A bare source-wide scan also matches the
    // comment that explains why the lib path is wrong, so the test would fail on
    // the corrected file — the documentation would have to be deleted to go green.
    const imports = [...source.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((line) => line.includes("redux-persist/lib/"))).toEqual([]);
    expect(imports.some((line) => line.includes("redux-persist/es/storage/createWebStorage"))).toBe(
      true,
    );
  });

  it("store.ts evaluates without throwing", async () => {
    // The actual regression: any throw here is a blank page in the browser.
    await expect(import("@/redux/store")).resolves.toBeDefined();
  });

  it("crashOverlay is the first import in main.tsx", () => {
    // Import order is the entire mechanism. Every `import` is hoisted above the
    // module body, so the overlay can only catch an import-time throw if it is
    // evaluated before the module that throws. Being first is not stylistic.
    const source = readFileSync(resolve(ROOT, "src/main.tsx"), "utf8");
    const imports = [...source.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports[0]).toMatch(/crashOverlay/);
  });

  it("main.tsx does not register crash handling in its own body", () => {
    // A handler added in the body runs after all imports have evaluated, which
    // is exactly the case it needs to catch. This was the original bug.
    const source = readFileSync(resolve(ROOT, "src/main.tsx"), "utf8");
    expect(source).not.toMatch(/window\.addEventListener\(\s*["']error["']/);
  });
});
