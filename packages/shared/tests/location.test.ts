import { describe, expect, it } from "vitest";
import { JOB_LOCATIONS } from "../src/index.js";
import {
  CITY_ALIASES,
  CITY_REGIONS,
  NEAR_ME_WEIGHTS,
  distanceBand,
  normalizeCity,
  nearMeScore,
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

describe("distanceBand", () => {
  it("prefers same city, then same region, then elsewhere", () => {
    expect(distanceBand("Bengaluru", "Bengaluru", false)).toBe("same_city");
    expect(distanceBand("Bengaluru", "Chennai", false)).toBe("same_region");
    expect(distanceBand("Bengaluru", "Mumbai", false)).toBe("elsewhere");
  });

  it("bands remote roles as remote, regardless of either city", () => {
    expect(distanceBand("Bengaluru", "Delhi NCR", true)).toBe("remote");
    expect(distanceBand("Bengaluru", "Bengaluru", true)).toBe("remote");
  });

  it("bands defensively as elsewhere with no seeker city", () => {
    expect(distanceBand(null, "Bengaluru", false)).toBe("elsewhere");
  });

  it("covers every board city except Remote, in a real region", () => {
    for (const city of Object.keys(CITY_REGIONS)) {
      expect(JOB_LOCATIONS).toContain(city);
      expect(CITY_REGIONS[city]).toMatch(/^(north|west|south|east)$/);
    }
  });
});

describe("nearMeScore", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("same city beats region beats elsewhere, fit held equal", () => {
    const a = nearMeScore("same_city", 50, now, now);
    const b = nearMeScore("same_region", 50, now, now);
    const c = nearMeScore("elsewhere", 50, now, now);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("remote outranks far-city roles but not same-city ones", () => {
    const remote = nearMeScore("remote", 50, now, now);
    expect(remote).toBeGreaterThan(nearMeScore("elsewhere", 50, now, now));
    expect(remote).toBeLessThan(nearMeScore("same_city", 50, now, now));
  });

  it("fit breaks distance ties", () => {
    expect(nearMeScore("same_city", 90, now, now)).toBeGreaterThan(
      nearMeScore("same_city", 10, now, now),
    );
  });

  it("recency decays linearly over eight weeks to zero", () => {
    const fresh = nearMeScore("same_city", 50, now, now);
    const fourWeeks = nearMeScore("same_city", 50, new Date(now.getTime() - 28 * 86_400_000), now);
    const nineWeeks = nearMeScore("same_city", 50, new Date(now.getTime() - 63 * 86_400_000), now);
    const tenWeeks = nearMeScore("same_city", 50, new Date(now.getTime() - 70 * 86_400_000), now);
    expect(fresh).toBeGreaterThan(fourWeeks);
    expect(fourWeeks).toBeGreaterThan(nineWeeks);
    expect(tenWeeks).toBe(nearMeScore("same_city", 50, new Date(now.getTime() - 365 * 86_400_000), now));
  });

  it("weights sum to one", () => {
    expect(Object.values(NEAR_ME_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});
