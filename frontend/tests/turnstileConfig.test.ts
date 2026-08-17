import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The env-to-flag derivation, isolated.
 *
 * `tests/turnstileAuth.test.tsx` mocks `turnstileEnabled` outright, which is
 * right for testing the forms and useless for testing the flag itself. This file
 * covers the other half: which environment values switch the challenge on. The
 * module is safe to re-evaluate here because nothing else is loaded alongside
 * it — no React, no store, so no second copy of anything to disagree with.
 */
async function loadWithKey(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", siteKey);
  return import("@/lib/turnstile");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("turnstile configuration", () => {
  it("is disabled when no site key is set", async () => {
    const { turnstileEnabled, turnstileSiteKey } = await loadWithKey(undefined);
    expect(turnstileEnabled).toBe(false);
    expect(turnstileSiteKey).toBe("");
  });

  it("is disabled when the site key is blank", async () => {
    // An env file carrying `VITE_TURNSTILE_SITE_KEY=` with a trailing space is
    // the common shape of "meant to fill this in later". Treating it as a key
    // would render a widget against an empty sitekey, which never resolves, and
    // the submit button would stay disabled forever with nothing to click.
    const { turnstileEnabled } = await loadWithKey("   ");
    expect(turnstileEnabled).toBe(false);
  });

  it("is enabled for a real site key, trimmed", async () => {
    const { turnstileEnabled, turnstileSiteKey } = await loadWithKey(
      " 1x00000000000000000000AA ",
    );
    expect(turnstileEnabled).toBe(true);
    expect(turnstileSiteKey).toBe("1x00000000000000000000AA");
  });

  it("adds the token header only when a token exists", async () => {
    const { turnstileRequestConfig } = await loadWithKey("1x00000000000000000000AA");

    expect(turnstileRequestConfig("token-1")).toEqual([
      { headers: { "X-Turnstile-Token": "token-1" } },
    ]);
    // Spread into an apiClient call, an empty tuple has to leave the argument
    // list untouched — passing `undefined` as a config object would override
    // the client's own defaults with nothing.
    expect(turnstileRequestConfig(null)).toEqual([]);
  });
});
