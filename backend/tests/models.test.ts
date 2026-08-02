import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";

/**
 * Stands in for `applications`, carrying the `ref` that Task 12 will repoint at
 * `Seeker`. Registered once at module scope: model registration is global and
 * permanent within a Vitest worker, so doing it inside a test would throw
 * OverwriteModelError on the second run.
 */
const LeakProbe = mongoose.model(
  "LeakProbe",
  new mongoose.Schema({ applicant: { type: mongoose.Schema.Types.ObjectId, ref: "Seeker" } }),
);

/**
 * Schema-level guarantees the rest of Phase 1B is built on.
 *
 * These are not "does Mongoose work" tests. Each one pins a decision that is
 * invisible in ordinary use and expensive when wrong: the first two would let a
 * password hash reach a client, and the third silently caps the userbase at one
 * account per portal.
 */
describe("account schemas", () => {
  it("keeps passwordHash out of a populated document", async () => {
    // The real leak path. Task 12 repoints Application.applicant at Seeker, and
    // the inherited getApplicants returns the populated document whole, so
    // `select: false` is the only thing standing between a recruiter viewing
    // applicants and every applicant's Argon2 hash.
    const seeker = await Seeker.create({
      email: "populated@x.test",
      fullName: "Populated Person",
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$UNIQUESENTINELVALUE",
    });
    await LeakProbe.create({ applicant: seeker._id });

    const populated = await LeakProbe.findOne({}).populate({ path: "applicant" });
    expect(JSON.stringify(populated)).not.toContain("UNIQUESENTINELVALUE");
    expect(JSON.stringify(populated)).not.toContain("passwordHash");
  });

  it("returns passwordHash only when asked for by name", async () => {
    await Seeker.create({
      email: "explicit@x.test",
      fullName: "Explicit Person",
      passwordHash: "$argon2id$sentinel",
    });

    // Plain read: absent, so a DTO built from it cannot leak the hash.
    expect((await Seeker.findOne({ email: "explicit@x.test" }))?.passwordHash).toBeUndefined();
    // Opt-in read: present, so login can still verify a password.
    const withSecret = await Seeker.findOne({ email: "explicit@x.test" }).select("+passwordHash");
    expect(withSecret?.passwordHash).toBe("$argon2id$sentinel");
  });

  it("allows many accounts with no Google id", async () => {
    // Regression test for a real defect. The googleId index was originally
    // `{ unique: true, sparse: true }`, but sparse only skips documents where
    // the field is ABSENT — `googleId` defaults to null, so every
    // password-registered account indexed an explicit null and the SECOND one
    // died with `E11000 dup key: { googleId: null }`. That is every registration
    // after the first, plus the entire Task 12 migration. A partial index keyed
    // on `$type: "string"` indexes only real Google ids.
    await Seeker.syncIndexes();
    await Seeker.create({ email: "nogoogle1@x.test", fullName: "No Google One" });
    await Seeker.create({ email: "nogoogle2@x.test", fullName: "No Google Two" });
    await Seeker.create({ email: "nogoogle3@x.test", fullName: "No Google Three" });
    expect(await Seeker.countDocuments({ googleId: null })).toBe(3);
  });

  it("still rejects a duplicate Google id", async () => {
    // The other half: the index must remain unique for real ids, or Task 9's
    // `findOne({ googleId })` picks an arbitrary one of two accounts.
    await Seeker.syncIndexes();
    await Seeker.create({ email: "g1@x.test", fullName: "G One", googleId: "google-sub-shared" });
    await expect(
      Seeker.create({ email: "g2@x.test", fullName: "G Two", googleId: "google-sub-shared" }),
    ).rejects.toThrow(/E11000/);
  });

  it("scopes email uniqueness to one collection", async () => {
    // ADR-0001: one person may hold both a seeker and a recruiter account.
    await Seeker.syncIndexes();
    await Recruiter.syncIndexes();
    await Seeker.create({ email: "both@x.test", fullName: "Both Seeker" });
    await Recruiter.create({ email: "both@x.test", fullName: "Both Recruiter" });
    expect(await Seeker.countDocuments({ email: "both@x.test" })).toBe(1);
    expect(await Recruiter.countDocuments({ email: "both@x.test" })).toBe(1);

    // But not twice on the same portal.
    await expect(
      Seeker.create({ email: "both@x.test", fullName: "Duplicate Seeker" }),
    ).rejects.toThrow(/E11000/);
  });

  it("stores phone as a string", async () => {
    // The inherited users collection typed this Number, destroying leading
    // zeros and any +91 prefix.
    const seeker = await Seeker.create({
      email: "phone@x.test",
      fullName: "Phone Person",
      phone: "+919876543210",
    });
    expect(seeker.phone).toBe("+919876543210");
    expect(Seeker.schema.path("phone").instance).toBe("String");
  });
});
