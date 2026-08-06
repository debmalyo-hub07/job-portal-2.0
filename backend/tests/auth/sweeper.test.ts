import { describe, it, expect } from "vitest";
import { sweepUnverifiedAccounts } from "../../src/lib/sweeper.js";
import { Seeker } from "../../src/models/seeker.model.js";
import { Admin } from "../../src/models/admin.model.js";
import { OtpCode } from "../../src/models/otpCode.model.js";

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

async function seed(props: any) {
  return await Seeker.create({
    fullName: "Seed",
    passwordHash: "x",
    ...props,
  });
}

describe("sweepUnverifiedAccounts", () => {
  it("deletes an unverified account past the TTL", async () => {
    await seed({ email: "stale@x.test", emailVerifiedAt: null, createdAt: hoursAgo(48) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "stale@x.test" })).toBe(0);
  });

  it("keeps an unverified account inside the TTL", async () => {
    await seed({ email: "fresh@x.test", emailVerifiedAt: null, createdAt: hoursAgo(2) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "fresh@x.test" })).toBe(1);
  });

  it("keeps a verified account of any age", async () => {
    await seed({ email: "old@x.test", emailVerifiedAt: hoursAgo(500), createdAt: hoursAgo(9000) });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "old@x.test" })).toBe(1);
  });

  // The one that matters. If someone drops `migratedFromLegacyAt: null` from the
  // filter, every other test above still passes and this one fails.
  it("NEVER deletes a migrated account, however old and unverified", async () => {
    await seed({ email: "legacy@x.test", emailVerifiedAt: null,
      createdAt: hoursAgo(9000), migratedFromLegacyAt: new Date() });
    await sweepUnverifiedAccounts();
    expect(await Seeker.countDocuments({ email: "legacy@x.test" })).toBe(1);
  });

  it("cascades the account's OTP rows", async () => {
    const doomed = await seed({ email: "otp@x.test", emailVerifiedAt: null, createdAt: hoursAgo(48) });
    await OtpCode.create({ codeHash: "h", purpose: "verify_email",
      subjectId: doomed._id, subjectType: "seeker", expiresAt: hoursAgo(-1) });
    await sweepUnverifiedAccounts();
    expect(await OtpCode.countDocuments({ subjectId: doomed._id })).toBe(0);
  });

  it("sweeps past a single batch", async () => {
    await Seeker.insertMany(Array.from({ length: 505 }, (_, i) => ({
      email: `b${i}@x.test`, fullName: "Batch", passwordHash: "x",
      emailVerifiedAt: null, createdAt: hoursAgo(48),
    })));
    const deleted = await sweepUnverifiedAccounts();
    expect(deleted.seeker).toBe(505);   // BATCH is 500 — proves the loop
  });

  // Phase 3A. The portal list is derived from the schema, so a new portal is
  // swept automatically — these pin that, because every case above is
  // seeker-only and would still pass if admins were silently skipped.
  it("sweeps an unverified admin, and reports it in the counts", async () => {
    await Admin.create({
      email: "stale-admin@x.test", fullName: "Stale Admin", passwordHash: "x",
      emailVerifiedAt: null, createdAt: hoursAgo(48),
    });
    const deleted = await sweepUnverifiedAccounts();
    expect(await Admin.countDocuments({ email: "stale-admin@x.test" })).toBe(0);
    expect(deleted.admin).toBe(1);
  });

  it("keeps a verified admin — seed:admin creates them verified", async () => {
    await Admin.create({
      email: "real-admin@x.test", fullName: "Real Admin", passwordHash: "x",
      emailVerifiedAt: hoursAgo(500), createdAt: hoursAgo(9000),
    });
    await sweepUnverifiedAccounts();
    expect(await Admin.countDocuments({ email: "real-admin@x.test" })).toBe(1);
  });

  it("returns a count for every portal, not just the ones that matched", async () => {
    const deleted = await sweepUnverifiedAccounts();
    expect(Object.keys(deleted).sort()).toEqual(["admin", "recruiter", "seeker"]);
  });
});
