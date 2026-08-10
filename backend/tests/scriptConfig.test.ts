import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPTS = resolve(__dirname, "../src/scripts");

/**
 * Every CLI script is its own entry point, and only `server.ts` imported
 * `dotenv/config`. So `npm run seed:admin` read no `.env` at all and died in
 * `env()` naming all fourteen required variables — output that reads like a
 * corrupt `.env` rather than a missing import, and which sent the first real
 * deployment looking in the wrong place.
 *
 * Nothing in the suite caught it: all three scripts are imported by tests, and
 * `tests/setup.ts` assigns its own values before any of them run, so the tested
 * path never needed dotenv. Only a direct run did — which is exactly the path
 * that has no test.
 *
 * This asserts on source text because the defect is a *missing import in an
 * entry point*. Importing the module here would prove nothing: the guarded
 * branch does not execute under a test, which is the whole reason it broke.
 */
describe("CLI scripts load their own configuration", () => {
  const scripts = readdirSync(SCRIPTS).filter((f) => f.endsWith(".ts"));

  it("finds the scripts to check", () => {
    // A scan that silently matches nothing is worse than no scan — the first
    // version of workspaceRoutes.test.tsx passed over zero files this way.
    expect(scripts.length).toBeGreaterThan(2);
  });

  for (const file of scripts) {
    const source = readFileSync(resolve(SCRIPTS, file), "utf8");

    it(`${file} imports dotenv when run directly`, () => {
      expect(source).toMatch(/import\(["']dotenv\/config["']\)/);
    });

    it(`${file} loads dotenv inside the direct-run guard, never at module scope`, () => {
      // A bare top-level `import "dotenv/config"` would also fix the CLI, and
      // would additionally load the developer's real .env into every test run
      // that imports this module. dotenv does not overwrite an existing value,
      // so setup.ts would still win — but a test process holding the real
      // MONGO_URI is not a boundary worth resting on that guarantee.
      const topLevelImport = /^\s*import\s+["']dotenv\/config["']/m;
      expect(source).not.toMatch(topLevelImport);

      // And it must actually sit after the guard, not merely be dynamic.
      const guard = source.indexOf("if (invokedDirectly)");
      const load = source.search(/import\(["']dotenv\/config["']\)/);
      expect(guard).toBeGreaterThan(-1);
      expect(load).toBeGreaterThan(guard);
    });
  }
});
