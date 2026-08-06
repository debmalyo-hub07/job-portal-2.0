import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { Recruiter } from "../src/models/recruiter.model.js";
import { migratePhase3a } from "../src/scripts/migrate-phase3a.js";

describe("migratePhase3a", () => {
  it("grandfathers verified recruiters to active", async () => {
    await Recruiter.create({
      email: "old@example.com",
      fullName: "Old Rec",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "pending",
    });

    const result = await migratePhase3a();

    expect(result.grandfathered).toBe(1);
    expect((await Recruiter.findOne({ email: "old@example.com" }))?.status).toBe("active");
  });

  // An unverified pre-existing row is indistinguishable from an abandoned
  // signup, so it stays pending rather than being handed an approved account.
  it("leaves an unverified recruiter pending", async () => {
    await Recruiter.create({
      email: "unver@example.com",
      fullName: "Unverified",
      passwordHash: null,
      emailVerifiedAt: null,
      status: "pending",
    });

    await migratePhase3a();

    expect((await Recruiter.findOne({ email: "unver@example.com" }))?.status).toBe("pending");
  });

  it("never resurrects a suspended recruiter", async () => {
    await Recruiter.create({
      email: "susp@example.com",
      fullName: "Suspended Rec",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "suspended",
    });

    await migratePhase3a();

    expect((await Recruiter.findOne({ email: "susp@example.com" }))?.status).toBe("suspended");
  });

  it("drops the legacy users collection and is safe to re-run", async () => {
    await mongoose.connection.db!.createCollection("users");
    const first = await migratePhase3a();
    expect(first.droppedUsers).toBe(true);

    const second = await migratePhase3a();
    expect(second.droppedUsers).toBe(false);
  });

  it("is idempotent — a second run grandfathers nothing", async () => {
    await Recruiter.create({
      email: "twice@example.com",
      fullName: "Twice",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "pending",
    });

    const first = await migratePhase3a();
    expect(first.grandfathered).toBe(1);

    const second = await migratePhase3a();
    expect(second.grandfathered).toBe(0);
    expect((await Recruiter.findOne({ email: "twice@example.com" }))?.status).toBe("active");
  });
});
