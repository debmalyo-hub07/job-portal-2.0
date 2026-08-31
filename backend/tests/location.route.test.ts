import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { AppError } from "../src/lib/AppError.js";
import { clearLocationCache } from "../src/services/location.service.js";
import * as locationService from "../src/services/location.service.js";

describe("GET /api/v1/location/reverse", () => {
  beforeEach(() => {
    clearLocationCache();
    vi.restoreAllMocks();
  });

  it("rejects out-of-range or non-numeric coordinates with a 400", async () => {
    for (const [lat, lng] of [[91, 0], [0, 181], ["abc", "0"]] as const) {
      const res = await request(buildApp()).get(`/api/v1/location/reverse?lat=${lat}&lng=${lng}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  it("returns the normalized city for a consented lookup", async () => {
    vi.spyOn(locationService, "reverseGeocode").mockResolvedValue({
      city: "Bengaluru", region: "Karnataka", country: "IN",
      matched: true, source: "openstreetmap",
    });
    const res = await request(buildApp()).get("/api/v1/location/reverse?lat=12.97&lng=77.59");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, city: "Bengaluru", matched: true });
  });

  it("surfaces a geocoder outage as a 502 envelope, not a crash", async () => {
    vi.spyOn(locationService, "reverseGeocode").mockRejectedValue(
      new AppError(502, "GEOCODER_UNAVAILABLE", "Could not resolve that location right now."),
    );
    const res = await request(buildApp()).get("/api/v1/location/reverse?lat=1&lng=1");
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("GEOCODER_UNAVAILABLE");
  });
});

describe("GET /api/v1/location/country", () => {
  it("answers the edge header's country when the proxy forwarded it", async () => {
    const res = await request(buildApp())
      .get("/api/v1/location/country")
      .set("x-vercel-ip-country", "AE");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, country: "AE" });
  });

  it("falls back to the caller's timezone, then India", async () => {
    const berlin = await request(buildApp()).get("/api/v1/location/country?tz=Europe/Berlin");
    expect(berlin.body.country).toBe("DE");
    const none = await request(buildApp()).get("/api/v1/location/country");
    expect(none.body.country).toBe("IN");
  });
});
