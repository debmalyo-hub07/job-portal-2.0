import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { buildApp } from "../src/app.js";
import { asSession, signedUpOn, installCaptureMailer } from "./auth/helpers.js";
import { Seeker } from "../src/models/seeker.model.js";

const app = buildApp();
beforeEach(installCaptureMailer);

/**
 * The consented device location (P2): stored city-level on the seeker,
 * projected as city + country, left alone when an edit does not touch it.
 * Deliberately distinct from the self-reported `profile.location` string the
 * matching pipeline reads — different provenance, different lifetime.
 */
describe("seeker consented location", () => {
  it("stores a consented city and country, and projects them back", async () => {
    const seeker = await signedUpOn("seeker", "geo@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("geoLocation", JSON.stringify({ city: "Bengaluru", country: "IN" }));

    expect(res.status).toBe(200);
    expect(res.body.profile.seeker.geoLocation).toEqual({ city: "Bengaluru", country: "IN" });

    const stored = await Seeker.findById(seeker.id);
    expect(stored?.geoLocation).toMatchObject({ city: "Bengaluru", country: "IN" });
    expect(stored?.geoLocation?.updatedAt).toBeInstanceOf(Date);
    // And nothing leaked coordinates, because none were ever stored.
    expect(JSON.stringify(res.body)).not.toMatch(/latitude|longitude/i);
  });

  it("refuses a malformed country code", async () => {
    const seeker = await signedUpOn("seeker", "geo2@x.test");
    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("geoLocation", JSON.stringify({ city: "Bengaluru", country: "IND" }));

    expect(res.status).toBe(400);
  });

  it("leaves an existing consented location alone when an edit does not touch it", async () => {
    const seeker = await signedUpOn("seeker", "geo3@x.test");
    await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("geoLocation", JSON.stringify({ city: "Pune", country: "IN" }));

    const res = await request(app)
      .post("/api/v1/user/profile/update")
      .use(asSession("seeker", seeker))
      .field("bio", "hello");

    expect(res.status).toBe(200);
    expect(res.body.profile.seeker.geoLocation).toEqual({ city: "Pune", country: "IN" });
  });
});
