import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

import { envSchema } from "../src/config/env.js";

const BACKEND = resolve(__dirname, "..");
const REPO = resolve(__dirname, "../..");

/**
 * Requiredness asked of the schema rather than read off the source text: a
 * variable is required exactly when its own parser rejects `undefined`, which
 * covers plain strings, `.default(...)`, `.optional()` and the
 * `.transform().pipe()` shape CLIENT_URLS uses without special-casing any.
 */
const shape = envSchema.shape as unknown as Record<
  string,
  { safeParse: (value: unknown) => { success: boolean } }
>;
const ALL_KEYS = Object.keys(shape);
const REQUIRED_KEYS = ALL_KEYS.filter((key) => !shape[key]!.safeParse(undefined).success);

type EnvVar = { key: string; value?: string; sync?: boolean };
type Blueprint = {
  services?: {
    name?: string;
    healthCheckPath?: string;
    numInstances?: number;
    autoDeploy?: boolean;
    startCommand?: string;
    buildCommand?: string;
    envVars?: EnvVar[];
  }[];
};

// A malformed blueprint is otherwise a deploy-time failure, reported by Render
// as a build error that never mentions YAML.
const blueprint = parse(readFileSync(resolve(REPO, "render.yaml"), "utf8")) as Blueprint;
const service = blueprint.services?.[0];
const declared = new Map((service?.envVars ?? []).map((v) => [v.key, v]));

/**
 * .env.example distinguishes the two cases in its own header: a variable with a
 * default is listed commented-out because the API boots without it, and a
 * variable with a blank value is required. So requiredness is checked against
 * the uncommented lines only — a `#` in front of a required variable reads to a
 * human deployer as "optional, has a default", which is the realistic version
 * of this mistake and the one worth catching.
 */
const exampleLines = readFileSync(resolve(BACKEND, ".env.example"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim());

const keyOf = (line: string, pattern: RegExp) => pattern.exec(line)?.[1];

/** Documented as required: named at the start of a line, no leading `#`. */
const EXAMPLE_REQUIRED = new Set(
  exampleLines
    .map((line) => keyOf(line, /^([A-Z][A-Z0-9_]*)=/))
    .filter((key): key is string => Boolean(key)),
);

/** Every key the template names at all, commented or not. */
const EXAMPLE_KEYS = new Set(
  exampleLines
    .map((line) => keyOf(line, /^#?\s*([A-Z][A-Z0-9_]*)=/))
    .filter((key): key is string => Boolean(key)),
);

describe("deploy config", () => {
  /**
   * A scan that resolves to nothing passes every assertion below it. The first
   * workspaceRoutes.test.tsx did exactly that — it read zero files and reported
   * green.
   */
  it("actually read a schema, a blueprint and an env template", () => {
    expect(REQUIRED_KEYS.length).toBeGreaterThan(10);
    expect(declared.size).toBeGreaterThan(10);
    expect(EXAMPLE_KEYS.size).toBeGreaterThan(10);
    expect(EXAMPLE_REQUIRED.size).toBeGreaterThan(10);
  });

  it.each(REQUIRED_KEYS)("%s is documented in .env.example", (key) => {
    // Uncommented, per the template's own convention. Commenting a required
    // variable out is how it stops being filled in.
    expect(EXAMPLE_REQUIRED.has(key)).toBe(true);
  });

  it.each(REQUIRED_KEYS)("%s is declared in render.yaml", (key) => {
    // Without this, a variable added to the schema deploys as a boot crash on
    // Render rather than a red test here.
    expect(declared.has(key)).toBe(true);
  });

  it("declares no variable the schema does not know", () => {
    // The other direction: a variable deleted from the schema must not linger
    // in the blueprint, where it reads as still-required forever.
    expect([...declared.keys()].filter((key) => !ALL_KEYS.includes(key))).toEqual([]);
  });

  it("names .env.example no variable the schema does not know", () => {
    expect([...EXAMPLE_KEYS].filter((key) => !ALL_KEYS.includes(key))).toEqual([]);
  });

  it("carries no secret value — every unpinned variable is sync: false", () => {
    // The blueprint is tracked in git. Only the two topology constants below
    // may carry a literal.
    const pinned = new Set(["NODE_ENV", "COOKIE_SAMESITE"]);
    for (const [key, entry] of declared) {
      if (pinned.has(key)) continue;
      expect({ key, value: entry.value, sync: entry.sync }).toEqual({
        key,
        value: undefined,
        sync: false,
      });
    }
  });

  it("pins NODE_ENV to production", () => {
    // env.ts defaults it to "development" and cookies.ts keys both the Secure
    // attribute and the __Host- prefix off it, so an API deployed without this
    // serves over HTTPS setting insecure cookies, with a healthy /health and no
    // error anywhere.
    expect(declared.get("NODE_ENV")).toEqual({ key: "NODE_ENV", value: "production" });
  });

  it("pins COOKIE_SAMESITE to none for a cross-site deployment", () => {
    // Render and Vercel are different registrable domains. Under `strict` the
    // cookie is never sent on the request after login: sign-in succeeds, the
    // next request is anonymous, and nothing is logged.
    expect(declared.get("COOKIE_SAMESITE")).toEqual({ key: "COOKIE_SAMESITE", value: "none" });
  });

  it("runs a single instance", () => {
    // rateLimitStore.ts is a single-process Map (ADR-0004), so every threshold
    // it enforces is per-instance: two instances turn LOGIN_LOCK_THRESHOLD 5
    // into ~10. Scaling this is a security change, not a capacity one.
    expect(service?.numInstances).toBe(1);
  });

  it("health-checks the endpoint that reports database connectivity", () => {
    expect(service?.healthCheckPath).toBe("/health");
  });

  it("leaves deployment to CI rather than to a push", () => {
    // Render's default deploys on every push, which would start a deploy while
    // the suite is still running — so the revision users get is the one the
    // host chose, not the one the workflow approved.
    expect(service?.autoDeploy).toBe(false);
  });

  it("builds shared before the API, from the repository root", () => {
    // npm resolves the workspace symlink only from the root, and the API
    // compiles against shared's emitted .d.ts.
    const build = service?.buildCommand ?? "";
    expect(build).toContain("@jobportal/shared");
    expect(build.indexOf("@jobportal/shared")).toBeLessThan(build.indexOf("@jobportal/api"));
  });

  it("installs devDependencies, without which tsc cannot run", () => {
    // NODE_ENV=production is pinned as a service variable, so it is set during
    // the build too, and npm omits devDependencies whenever it sees it. That
    // removes typescript itself along with every @types/* package, and the
    // build dies with dozens of TS7016 "could not find a declaration file for
    // module 'express'" errors that name a dependency rather than the cause.
    //
    // This failed a real deploy. It passed CI at the time because the workflow
    // installed with a bare `npm ci` and so never reproduced the production
    // install; cd.yml now sets NODE_ENV for its install and build steps.
    expect(service?.buildCommand ?? "").toMatch(/npm ci --include=dev\b/);
  });

  it("starts node directly so SIGTERM reaches the shutdown handler", () => {
    // Through `npm start` the signal lands on npm, which need not forward it —
    // and server.ts's SIGTERM handler is what closes the listener, stops the
    // sweeper and disconnects Mongo. Render sends SIGTERM on every redeploy.
    expect(service?.startCommand).toBe("node backend/dist/server.js");
  });
});
