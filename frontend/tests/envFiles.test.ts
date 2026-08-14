import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const BOM = "﻿";

/**
 * A byte-order mark in a dotenv file becomes part of the first key's *name*, so
 * Vite parses `<BOM>VITE_API_URL` and `import.meta.env.VITE_API_URL` is
 * `undefined`. axios then falls back to the page origin, every API call hits the
 * Vite dev server, which answers index.html with 200 — the app looks online and
 * nothing works. This repo has now been bitten by a BOM'd env file twice; the
 * first time real secrets in a UTF-16 file also defeated every grep-based scan.
 */
describe("env files are BOM-free", () => {
  const envFiles = readdirSync(ROOT).filter((f) => f.startsWith(".env"));

  it("finds at least one env file to check", () => {
    // A scan that silently matches nothing is worse than no scan.
    expect(envFiles.length).toBeGreaterThan(0);
  });

  for (const file of envFiles) {
    it(`${file} has no byte-order mark and no UTF-16 nulls`, () => {
      const buf = readFileSync(resolve(ROOT, file));
      expect(buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      // UTF-16 shows up as interleaved NULs; grep and dotenv both mishandle it.
      expect(buf.includes(0x00)).toBe(false);
      expect(buf.toString("utf8").startsWith(BOM)).toBe(false);
    });
  }

  it("ships a .env.example documenting required public build variables", () => {
    const example = resolve(ROOT, ".env.example");
    expect(existsSync(example)).toBe(true);
    const source = readFileSync(example, "utf8");
    expect(source).toMatch(/^VITE_API_URL=/m);
    expect(source).toMatch(/^VITE_TURNSTILE_SITE_KEY=/m);
  });

  it("apiClient fails loudly when VITE_API_URL is missing", () => {
    // Without this guard axios silently defaults baseURL to the page origin.
    const source = readFileSync(resolve(ROOT, "src/lib/apiClient.ts"), "utf8");
    expect(source).toMatch(/VITE_API_URL is not set/);
  });
});
