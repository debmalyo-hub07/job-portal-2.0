import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { asSession, signedUpOn, installCaptureMailer } from "./auth/helpers.js";
import { Company } from "../src/models/company.model.js";
import { Job } from "../src/models/job.model.js";
import { Seeker } from "../src/models/seeker.model.js";

const app = buildApp();
beforeEach(async () => {
  installCaptureMailer();
  await Promise.all([Seeker.deleteMany({}), Company.deleteMany({}), Job.deleteMany({})]);
});

const WEEK = 7 * 86_400_000;

/** A job with a pinned posting date — createdAt is immutable after create. */
async function seedJob(fields: {
  title: string;
  location: string;
  remote?: boolean;
  postedWeeksAgo: number;
  companyId: unknown;
}) {
  const at = new Date(Date.now() - fields.postedWeeksAgo * WEEK);
  const job = new Job({
    title: fields.title,
    description: "A role.",
    requirements: [],
    salary: 20,
    experienceLevel: 3,
    location: fields.location,
    jobType: "Full-time",
    department: "Engineering",
    position: "1",
    remote: fields.remote ?? false,
    company: fields.companyId,
    created_by: new (await import("mongoose")).Types.ObjectId(),
    createdAt: at,
    updatedAt: at,
  });
  await job.save({ timestamps: false });
  return job;
}

describe("GET /api/v1/job/near-me", () => {
  let companyId: unknown;

  beforeEach(async () => {
    const company = await Company.create({
      name: "Near Test Co",
      description: "d",
      location: "Bengaluru",
      userId: new (await import("mongoose")).Types.ObjectId(),
    });
    companyId = company._id;
  });

  it("ranks the board by the seeker's area, fit held equal", async () => {
    const seeker = await signedUpOn("seeker", "near@x.test");
    await Seeker.findByIdAndUpdate(seeker.id, {
      geoLocation: { city: "Bengaluru", country: "IN", updatedAt: new Date() },
    });

    await seedJob({ title: "Fresh Bengaluru", location: "Bengaluru", postedWeeksAgo: 1, companyId });
    await seedJob({ title: "Stale Bengaluru", location: "Bengaluru", postedWeeksAgo: 7, companyId });
    await seedJob({ title: "Remote role", location: "Delhi NCR", remote: true, postedWeeksAgo: 6 / 7, companyId });
    await seedJob({ title: "Chennai role", location: "Chennai", postedWeeksAgo: 1, companyId });
    await seedJob({ title: "Mumbai role", location: "Mumbai", postedWeeksAgo: 1, companyId });

    const res = await request(app)
      .get("/api/v1/job/near-me")
      .use(asSession("seeker", seeker));

    expect(res.status).toBe(200);
    const titles = res.body.items.map((item: { title: string }) => item.title);
    expect(titles).toEqual([
      "Fresh Bengaluru",
      "Stale Bengaluru",
      "Remote role",
      "Chennai role",
      "Mumbai role",
    ]);

    const bands = Object.fromEntries(res.body.items.map((item: { title: string; band: string }) => [item.title, item.band]));
    expect(bands["Fresh Bengaluru"]).toBe("same_city");
    expect(bands["Remote role"]).toBe("remote");
    expect(bands["Chennai role"]).toBe("same_region");
    expect(bands["Mumbai role"]).toBe("elsewhere");
    expect(res.body.total).toBe(5);
  });

  it("falls back to the self-reported location, aliases and all", async () => {
    const seeker = await signedUpOn("seeker", "selfreport@x.test");
    await Seeker.findByIdAndUpdate(seeker.id, { "profile.location": "Bangalore" });
    await seedJob({ title: "Bengaluru via alias", location: "Bengaluru", postedWeeksAgo: 1, companyId });
    await seedJob({ title: "Far away", location: "Kolkata", postedWeeksAgo: 1, companyId });

    const res = await request(app)
      .get("/api/v1/job/near-me")
      .use(asSession("seeker", seeker));

    expect(res.status).toBe(200);
    expect(res.body.items[0].title).toBe("Bengaluru via alias");
    expect(res.body.items[0].band).toBe("same_city");
  });

  it("refuses, with a code the UI can prompt on, when no area exists", async () => {
    const seeker = await signedUpOn("seeker", "nowhere@x.test");
    const res = await request(app)
      .get("/api/v1/job/near-me")
      .use(asSession("seeker", seeker));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NEAR_ME_NO_LOCATION");
  });

  it("requires a seeker session", async () => {
    const res = await request(app).get("/api/v1/job/near-me");
    expect(res.status).toBe(401);
  });
});
