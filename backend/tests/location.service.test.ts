import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  clearLocationCache,
  countryFromRequest,
  locationCacheSize,
  reverseGeocode,
} from "../src/services/location.service.js";

/** A Nominatim-shaped payload the fake fetch serves. */
const nominatim = (address: Record<string, string>) =>
  new Response(JSON.stringify({ address }), { status: 200 });

describe("reverseGeocode", () => {
  beforeEach(() => clearLocationCache());

  it("normalizes the geocoder's city against the board vocabulary", async () => {
    const fetchImpl = vi.fn(async () =>
      nominatim({ city: "Bangalore", state: "Karnataka", country_code: "in" }),
    );
    const dto = await reverseGeocode(12.9698, 77.75, fetchImpl);
    expect(dto).toMatchObject({ city: "Bengaluru", matched: true, country: "IN" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes an unknown city through unmatched", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Jaipur", country_code: "in" }));
    const dto = await reverseGeocode(26.9, 75.8, fetchImpl);
    expect(dto).toMatchObject({ city: "Jaipur", matched: false });
  });

  it("survives a geocoder answer with no city: nulls, not a crash", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ country_code: "in" }));
    const dto = await reverseGeocode(1, 1, fetchImpl);
    expect(dto.city).toBeNull();
    expect(dto.matched).toBe(false);
  });

  it("answers the second lookup in the same ~1km box from cache", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Pune", country_code: "in" }));
    await reverseGeocode(18.5204, 73.8567, fetchImpl);
    const dto = await reverseGeocode(18.521, 73.8572, fetchImpl);
    expect(dto.city).toBe("Pune");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(locationCacheSize()).toBe(1);
  });

  it("throws a 502 AppError when the geocoder is down", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 }));
    await expect(reverseGeocode(1, 1, fetchImpl)).rejects.toMatchObject({
      statusCode: 502,
      code: "GEOCODER_UNAVAILABLE",
    });
  });

  it("sends a descriptive User-Agent, as Nominatim's usage policy requires", async () => {
    const fetchImpl = vi.fn(async () => nominatim({ city: "Pune", country_code: "in" }));
    await reverseGeocode(18.5, 73.8, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(init.headers["User-Agent"]).toMatch(/cairn/i);
  });
});

describe("countryFromRequest", () => {
  it("prefers the proxy-forwarded edge country header", () => {
    const headers = new Headers({ "x-vercel-ip-country": "AE" });
    expect(countryFromRequest(headers, "Asia/Kolkata")).toBe("AE");
  });

  it("falls back to the caller's timezone, then India", () => {
    expect(countryFromRequest(new Headers(), "Europe/Berlin")).toBe("DE");
    expect(countryFromRequest(new Headers(), "nowhere/nowhere")).toBe("IN");
    expect(countryFromRequest(new Headers(), null)).toBe("IN");
  });
});
