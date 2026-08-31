import { describe, expect, it } from "vitest";
import { JOB_LOCATIONS } from "../src/index.js";
import {
  CITY_ALIASES,
  normalizeCity,
  seekerLocationSchema,
} from "../src/index.js";

describe("normalizeCity", () => {
  it("matches a board city directly", () => {
    expect(normalizeCity("Bengaluru")).toEqual({ city: "Bengaluru", matched: true });
  });

  it("maps aliases onto the board's vocabulary", () => {
    // The catalogue's own comment: Noida and Gurugram are both "Delhi NCR".
    expect(normalizeCity("Noida")).toEqual({ city: "Delhi NCR", matched: true });
    expect(normalizeCity("Gurugram")).toEqual({ city: "Delhi NCR", matched: true });
    expect(normalizeCity("Bangalore")).toEqual({ city: "Bengaluru", matched: true });
  });

  it("passes an unknown city through verbatim, unmatched", () => {
    expect(normalizeCity("Jaipur")).toEqual({ city: "Jaipur", matched: false });
  });

  it("returns null for nothing usable", () => {
    expect(normalizeCity(null)).toBeNull();
    expect(normalizeCity("   ")).toBeNull();
  });

  it("never maps an alias to a city outside the board vocabulary", () => {
    for (const target of Object.values(CITY_ALIASES)) {
      expect(JOB_LOCATIONS).toContain(target);
    }
  });
});

describe("seekerLocationSchema", () => {
  it("accepts a city and an ISO country code", () => {
    expect(seekerLocationSchema.parse({ city: "Bengaluru", country: "IN" })).toEqual({
      city: "Bengaluru",
      country: "IN",
    });
  });

  it("rejects a non-alpha-2 country and an empty city", () => {
    expect(seekerLocationSchema.safeParse({ city: "Bengaluru", country: "IND" }).success).toBe(false);
    expect(seekerLocationSchema.safeParse({ city: "", country: "IN" }).success).toBe(false);
  });
});

describe("profileUpdateBodySchema.geoLocation", () => {
  it("accepts the consented location as a multipart JSON string", async () => {
    const { profileUpdateBodySchema } = await import("../src/index.js");
    const body = profileUpdateBodySchema.parse({
      geoLocation: JSON.stringify({ city: "Bengaluru", country: "IN" }),
    });
    expect(body.geoLocation).toEqual({ city: "Bengaluru", country: "IN" });
  });

  it("leaves geoLocation alone when the edit does not touch it", async () => {
    const { profileUpdateBodySchema } = await import("../src/index.js");
    expect(profileUpdateBodySchema.parse({ bio: "hello" }).geoLocation).toBeUndefined();
  });

  it("refuses a location that is neither valid JSON nor a valid location", async () => {
    const { profileUpdateBodySchema } = await import("../src/index.js");
    expect(profileUpdateBodySchema.safeParse({ geoLocation: "not json" }).success).toBe(false);
    expect(
      profileUpdateBodySchema.safeParse({ geoLocation: { city: "Bengaluru", country: "IND" } }).success,
    ).toBe(false);
  });
});
