import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { defineModel } from "../src/models/defineModel.js";
import { Admin } from "../src/models/admin.model.js";
import { accountModel } from "../src/services/account.service.js";
import { PORTALS, portalSchema } from "@jobportal/shared";

/**
 * Stands in for `applications`, carrying the `ref` that Task 12 will repoint at
 * `Seeker`.
 *
 * Registered idempotently. `vitest.config.ts` sets `singleFork: true`, so every
 * test file shares ONE module registry and ONE mongoose instance — a bare
 * `mongoose.model(...)` at module scope throws OverwriteModelError as soon as a
 * second test file imports anything that re-evaluates this. Reuse the existing
 * registration when there is one.
 */
const LeakProbe = defineModel<{ applicant: mongoose.Types.ObjectId }>(
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

  it("scopes email uniqueness to one collection — the registry guards across", async () => {
    // Inverted 2026-08-27. This used to assert ADR-0001's dual-account rule
    // outright (same address, one seeker row AND one recruiter row). The
    // email registry reversed the rule, but deliberately did NOT touch the
    // per-collection indexes: they stay unique WITHIN each collection as the
    // backstop that makes registry drift fail loudly on the same portal.
    // Cross-portal refusal is the service layer's job — every creation site
    // writes the registry row first — and that is what the service-path tests
    // in register.test.ts, emailRegistry.test.ts and emailChange.test.ts
    // assert. The layering is the assertion: raw models stay per-collection,
    // services refuse cross-portal.
    await Seeker.syncIndexes();
    await Recruiter.syncIndexes();
    await Seeker.create({ email: "both@x.test", fullName: "Both Seeker" });
    // Possible at the raw-model level — nothing here consults the registry.
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

import { Application } from "../src/models/application.model.js";
import { Company } from "../src/models/company.model.js";
import { Types } from "mongoose";

describe("phase 1C model constraints", () => {
  it("rejects a duplicate {job, applicant} application at the index", async () => {
    await Application.init(); // ensure indexes exist in memory server
    const job = new Types.ObjectId();
    const applicant = new Types.ObjectId();
    await Application.create({ job, applicant });
    await expect(Application.create({ job, applicant })).rejects.toMatchObject({ code: 11000 });
  });

  it("company name is unique per recruiter, not globally", async () => {
    await Company.init();
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    await Company.create({ name: "Acme", userId: a });
    await expect(Company.create({ name: "Acme", userId: b })).resolves.toBeTruthy();
    await expect(Company.create({ name: "Acme", userId: a })).rejects.toMatchObject({ code: 11000 });
  });
});

describe("sanitizeFilter", () => {
  it("treats an operator-shaped value as a literal instead of an operator", async () => {
    await Company.create({ name: "Filter Co", userId: new Types.ObjectId() });
    // Injected via a string field, this used to match every document. With
    // sanitizeFilter on it is wrapped in $eq and compared as a value — which for
    // a string path means it fails to cast rather than matching anything. Either
    // way the injection cannot reach a document; it must never resolve to a hit.
    await expect(Company.findOne({ name: { $ne: "" } as unknown as string })).rejects.toThrow(
      /Cast to string failed/,
    );
  });

  it("still honours an operator the application itself asked for", async () => {
    const userId = new Types.ObjectId();
    await Company.create({ name: "Trusted Co", userId });
    const hit = await Company.findOne({
      userId,
      createdAt: mongoose.trusted({ $lt: new Date(Date.now() + 60_000) }),
    });
    expect(hit).not.toBeNull();
  });
});

/**
 * Phase 3A: the admin portal. `Portal` widening to three values is what makes
 * every site needing a third case a compile error — these pin the runtime half.
 */
describe("admin portal", () => {
  it("portalSchema accepts all three portals", () => {
    expect(portalSchema.parse("seeker")).toBe("seeker");
    expect(portalSchema.parse("recruiter")).toBe("recruiter");
    expect(portalSchema.parse("admin")).toBe("admin");
  });

  it("rejects an unknown portal", () => {
    expect(portalSchema.safeParse("root").success).toBe(false);
  });

  it("derives PORTALS from the schema, so it carries all three", () => {
    expect([...PORTALS]).toEqual(["seeker", "recruiter", "admin"]);
  });

  it("resolves the admin portal to the admins collection", () => {
    expect(accountModel("admin")).toBe(Admin);
    expect(Admin.collection.name).toBe("admins");
  });

  it("an admin carries the shared auth fields", async () => {
    const admin = await Admin.create({
      email: "Root@Example.com",
      fullName: "Root Admin",
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });
    expect(admin.email).toBe("root@example.com");
    expect(admin.status).toBe("active");
    expect(admin.googleId).toBeNull();
  });

  it("keeps the admin email index unique, like the other two collections", async () => {
    await Admin.init();
    await Admin.create({ email: "dupe@example.com", fullName: "First Admin" });
    await expect(Admin.create({ email: "dupe@example.com", fullName: "Second Admin" })).rejects.toThrow(
      /duplicate key/i,
    );
  });
});
