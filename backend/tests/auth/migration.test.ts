import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import { migratePhase1b } from "../../src/scripts/migrate-phase1b.js";
import { User } from "../../src/models/user.model.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { Recruiter } from "../../src/models/recruiter.model.js";

describe("migratePhase1b", () => {
  it("preserves _id so existing refs keep resolving", async () => {
    const user = await User.create({ fullname: "Ann", email: "Ann@X.test", phoneNumber: 12345,
      password: "$2b$10$abcdefghijklmnopqrstuv", role: "student",
      profile: { bio: "hi", skills: ["ts"], resume: "https://cdn/x.pdf", resumeOriginalName: "x.pdf" } });
    await migratePhase1b();
    const seeker = await Seeker.findById(user._id).select("+passwordHash");
    expect(seeker).not.toBeNull();
    expect(seeker!.email).toBe("ann@x.test");        // normalised
    expect(seeker!.fullName).toBe("Ann");
    expect(seeker!.phone).toBe("12345");             // now a string
    expect(seeker!.passwordHash).toBe("$2b$10$abcdefghijklmnopqrstuv");
    expect(seeker!.emailVerifiedAt).toBeNull();      // NOT grandfathered
    expect(seeker!.migratedFromLegacyAt).not.toBeNull();
    expect(seeker!.profile!.skills).toEqual(["ts"]);
    expect(seeker!.resume!.storageKey).toBe("https://cdn/x.pdf");
  });

  it("routes by role and reports rows it cannot route", async () => {
    await User.create({ fullname: "Seeker One", email: "s@x.test", phoneNumber: 1,
      password: "x", role: "student" });
    await User.create({ fullname: "Rec One", email: "r@x.test", phoneNumber: 2,
      password: "x", role: "recruiter" });
    // Written straight to the collection: `role` has an enum, so Mongoose would
    // reject this through the model. The migration still has to survive it —
    // inherited data predates the enum.
    await mongoose.connection.collection("users").insertOne({
      fullname: "Admin", email: "a@x.test", phoneNumber: 3, password: "x", role: "admin",
    });

    const report = await migratePhase1b();

    expect(report.scanned).toBe(3);
    expect(report.inserted).toEqual({ seeker: 1, recruiter: 1 });
    expect(await Seeker.countDocuments({})).toBe(1);
    expect(await Recruiter.countDocuments({})).toBe(1);
    // Reported, not silently dropped, and not guessed into a portal.
    expect(report.skippedBadRole).toEqual([{ id: expect.any(String), role: "admin" }]);
    expect(await Seeker.countDocuments({ email: "a@x.test" })).toBe(0);
    expect(await Recruiter.countDocuments({ email: "a@x.test" })).toBe(0);
  });

  it("is idempotent and never clobbers post-migration state", async () => {
    await User.create({ fullname: "Ann", email: "ann@x.test", phoneNumber: 12345, password: "x", role: "student" });
    await migratePhase1b();
    await Seeker.updateOne({ email: "ann@x.test" }, { $set: { emailVerifiedAt: new Date() } });
    const second = await migratePhase1b();
    expect(second.inserted.seeker).toBe(0);
    const seeker = await Seeker.findOne({ email: "ann@x.test" });
    expect(seeker!.emailVerifiedAt).not.toBeNull();   // $setOnInsert did not undo it
  });

  it("reports an email already claimed on the new endpoints instead of throwing", async () => {
    await Seeker.create({ email: "clash@x.test", fullName: "New", passwordHash: "x" });
    await User.create({ fullname: "Old", email: "clash@x.test", phoneNumber: 1,
      password: "x", role: "student" });
    const report = await migratePhase1b();
    expect(report.emailConflicts).toHaveLength(1);
    expect(await Seeker.countDocuments({ email: "clash@x.test" })).toBe(1);
  });

  it("writes nothing on --dry-run", async () => {
    await User.create({ fullname: "Dry", email: "dry@x.test", phoneNumber: 1, password: "x", role: "student" });
    const report = await migratePhase1b({ dryRun: true });
    expect(report.scanned).toBe(1);
    expect(await Seeker.countDocuments({ email: "dry@x.test" })).toBe(0);
  });
});
