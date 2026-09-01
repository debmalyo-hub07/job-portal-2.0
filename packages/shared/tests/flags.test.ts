import { describe, expect, it } from "vitest";

import {
  FLAG_KEYS,
  FLAG_REGISTRY,
  flagDefault,
  flagKeySchema,
  setFlagBodySchema,
} from "../src/flags.js";

describe("the flag registry", () => {
  it("has unique keys", () => {
    expect(new Set(FLAG_REGISTRY.map((flag) => flag.key)).size).toBe(FLAG_REGISTRY.length);
  });

  it("ships P4's auto-approve flag, off", () => {
    const flag = FLAG_REGISTRY.find((entry) => entry.key === "autoApproveRecruiterSignups");
    expect(flag?.default).toBe(false);
    expect(flag?.description).toMatch(/reserved/i);
  });

  it("defaults a key to its registry default", () => {
    expect(flagDefault("autoApproveRecruiterSignups")).toBe(false);
  });

  it("validates keys and bodies", () => {
    expect(flagKeySchema.safeParse("autoApproveRecruiterSignups").success).toBe(true);
    expect(flagKeySchema.safeParse("not-a-flag").success).toBe(false);
    expect(setFlagBodySchema.safeParse({ enabled: true }).success).toBe(true);
    expect(setFlagBodySchema.safeParse({ enabled: "yes" }).success).toBe(false);
    expect(FLAG_KEYS).toContain("autoApproveRecruiterSignups");
  });
});
