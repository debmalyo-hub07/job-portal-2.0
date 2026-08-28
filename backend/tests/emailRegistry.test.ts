import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";

import { EmailRegistry } from "../src/models/emailRegistry.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Admin } from "../src/models/admin.model.js";
import {
  registryDisagreements,
  releaseEmail,
  reserveEmail,
} from "../src/services/emailRegistry.service.js";
import { backfillEmailRegistry } from "../src/scripts/backfill-email-registry.js";
import { reconcileEmailRegistry } from "../src/scripts/reconcile-email-registry.js";
import { sweepUnverifiedAccounts } from "../src/lib/sweeper.js";
import { seedAdmin } from "../src/scripts/seed-admin.js";
import { seedDemoCatalog } from "../src/scripts/seed-demo-catalog.js";
import { createAdmin } from "../src/services/adminProvisioning.service.js";
import { env } from "../src/config/env.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

beforeEach(async () => {
  await installCaptureMailer();
  // The unique index must exist before the first duplicate insert, or the
  // index-is-the-guarantee tests race autoIndex.
  await EmailRegistry.init();
});

describe("email registry model", () => {
  it("refuses a second row for one address, across portals", async () => {
    await EmailRegistry.create({ email: "owner@x.test", portal: "seeker", subjectId: new Types.ObjectId() });
    await expect(
      EmailRegistry.create({ email: "owner@x.test", portal: "recruiter", subjectId: new Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("reserveEmail returns the id the account must be created with", async () => {
    const id = await reserveEmail("seeker", "Reserve@X.Test");
    expect(id).toBeInstanceOf(Types.ObjectId);
    const row = await EmailRegistry.findOne({ subjectId: id }).lean();
    expect(row?.email).toBe("reserve@x.test"); // normalised, like register
    expect(row?.portal).toBe("seeker");
  });

  it("reserveEmail refuses a cross-portal claim with EMAIL_TAKEN", async () => {
    await reserveEmail("seeker", "clash@x.test");
    await expect(reserveEmail("recruiter", "clash@x.test")).rejects.toMatchObject({
      statusCode: 409,
      code: "EMAIL_TAKEN",
    });
  });

  it("releaseEmail frees a failed reservation", async () => {
    const id = await reserveEmail("seeker", "compensate@x.test");
    await releaseEmail(id);
    // The same address is claimable again immediately.
    await expect(reserveEmail("recruiter", "compensate@x.test")).resolves.toBeInstanceOf(
      Types.ObjectId,
    );
  });
});

describe("registry write at the creation sites", () => {
  it("register's compensating delete frees the row when account creation fails", async () => {
    // Force the account create to fail AFTER the registry insert: the row
    // must be freed or a half-failed registration squats the address.
    const boom = new Error("boom");
    const create = vi.spyOn(Seeker, "create").mockRejectedValueOnce(boom);
    const { register } = await import("../src/services/auth.service.js");
    await expect(
      register("seeker", {
        fullName: "Broken Create",
        email: "broken-create@x.test",
        password: "correct horse battery staple",
      }),
    ).rejects.toBe(boom);
    create.mockRestore();

    expect(await EmailRegistry.countDocuments({ email: "broken-create@x.test" })).toBe(0);
    // And the address is free again.
    const id = await reserveEmail("seeker", "broken-create@x.test");
    expect(id).toBeTruthy();
  });

  it("the sweeper frees the address when it deletes the account", async () => {
    // Created directly with an old `createdAt` (immutable after create, so an
    // update would be silently dropped) plus its registry row — the exact
    // state an abandoned unverified registration leaves behind.
    const cutoff = new Date(Date.now() - (env().UNVERIFIED_ACCOUNT_TTL_HOURS + 1) * 3_600_000);
    const doomed = await Seeker.create({
      email: "swept@x.test",
      fullName: "Sweep Me",
      passwordHash: "x",
      emailVerifiedAt: null,
      createdAt: cutoff,
    });
    await EmailRegistry.create({ email: "swept@x.test", portal: "seeker", subjectId: doomed._id });

    await sweepUnverifiedAccounts();

    expect(await Seeker.countDocuments({ email: "swept@x.test" })).toBe(0);
    expect(await EmailRegistry.countDocuments({ email: "swept@x.test" })).toBe(0);
    // The address is registerable again the instant the sweep lands — on any
    // portal, which is the whole point of the registry going with the account.
    const { register } = await import("../src/services/auth.service.js");
    await expect(
      register("recruiter", {
        fullName: "Recycler",
        email: "swept@x.test",
        password: "correct horse battery staple",
      }),
    ).resolves.toBeUndefined();
  });

  it("seedAdmin refuses an address held on another portal", async () => {
    await reserveEmail("seeker", "seed-taken@x.test");
    await expect(
      seedAdmin({ email: "seed-taken@x.test", fullName: "Too Late" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await Admin.countDocuments({ email: "seed-taken@x.test" })).toBe(0);
    // The refusal squatted nothing: the seed can be re-run for another address.
    await expect(seedAdmin({ email: "seed-free@x.test", fullName: "Fine" })).resolves.toEqual({
      created: true,
    });
  });

  it("createAdmin refuses an address held on another portal", async () => {
    await reserveEmail("seeker", "provision-taken@x.test");
    await expect(
      createAdmin({
        email: "provision-taken@x.test",
        fullName: "Nope",
        provisioningKey: env().ADMIN_PROVISIONING_SECRET,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_TAKEN" });
    expect(await Admin.countDocuments({ email: "provision-taken@x.test" })).toBe(0);
  });

  it("seedDemoCatalog refuses when the reserved owner address is held elsewhere", async () => {
    await reserveEmail("seeker", "catalog@demo.invalid");
    await expect(seedDemoCatalog({})).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await Recruiter.countDocuments({ email: "catalog@demo.invalid" })).toBe(0);
    expect(outbox.length).toBe(0); // no code was minted for a catalogue owner
  });

  it("two portals racing one address produce exactly one winner", async () => {
    // The index-is-the-guarantee test. Both claims run concurrently; the
    // application-level check cannot save either of them, only the unique
    // index decides.
    const results = await Promise.allSettled([
      reserveEmail("seeker", "raced@x.test"),
      reserveEmail("recruiter", "raced@x.test"),
    ]);
    const winners = results.filter((r) => r.status === "fulfilled");
    const losers = results.filter((r) => r.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await EmailRegistry.countDocuments({ email: "raced@x.test" })).toBe(1);
  });
});

describe("backfill", () => {
  it("writes one row per existing account, and is re-runnable", async () => {
    // Accounts created straight at the model — the pre-registry shape every
    // production row is in when the backfill runs.
    await Seeker.create({ email: "legacy-seeker@x.test", fullName: "Legacy Seeker" });
    await Recruiter.create({ email: "legacy-recruiter@x.test", fullName: "Legacy Recruiter" });

    const first = await backfillEmailRegistry();
    expect(first.total).toBe(2);
    expect(await EmailRegistry.countDocuments()).toBe(2);
    expect(await registryDisagreements()).toEqual([]);

    // A second run writes nothing and changes nothing.
    const second = await backfillEmailRegistry();
    expect(second.total).toBe(0);
    expect(await EmailRegistry.countDocuments()).toBe(2);
  });

  it("fails loudly on a real collision — that failure is the pre-flight", async () => {
    // The shape the 2026-08-26 scan said could not exist. If it ever does,
    // the backfill must refuse rather than pick a winner quietly.
    await Seeker.create({ email: "collision@x.test", fullName: "Collision Seeker" });
    await Recruiter.create({ email: "collision@x.test", fullName: "Collision Recruiter" });
    await expect(backfillEmailRegistry()).rejects.toMatchObject({ code: 11000 });
  });
});

describe("reconciliation", () => {
  it("repairs an orphan row (crash between registry insert and account create)", async () => {
    const orphan = await EmailRegistry.create({
      email: "orphan@x.test",
      portal: "seeker",
      subjectId: new Types.ObjectId(), // resolves to no account
    });
    const result = await reconcileEmailRegistry();
    expect(result.orphansRemoved).toBe(1);
    expect(await EmailRegistry.countDocuments({ _id: orphan._id })).toBe(0);
    expect(await registryDisagreements()).toEqual([]);
  });

  it("repairs a stale row (crash mid-email-change)", async () => {
    const account = await Seeker.create({ email: "real@x.test", fullName: "Real Owner" });
    // The account moved on; the row still names the address it left.
    await EmailRegistry.create({
      email: "left-behind@x.test",
      portal: "seeker",
      subjectId: account._id,
    });

    const result = await reconcileEmailRegistry();
    expect(result.rowsRewritten).toBe(1);
    expect(await EmailRegistry.countDocuments({ email: "left-behind@x.test" })).toBe(0);
    const row = await EmailRegistry.findOne({ subjectId: account._id }).lean();
    expect(row?.email).toBe("real@x.test"); // the account's email is authoritative
    expect(await registryDisagreements()).toEqual([]);
  });

  it("leaves an agreed registry untouched", async () => {
    await Seeker.create({ email: "agree@x.test", fullName: "Agreed" });
    await backfillEmailRegistry();
    const result = await reconcileEmailRegistry();
    expect(result.rowsRewritten).toBe(0);
    expect(result.orphansRemoved).toBe(0);
    expect(result.disagreementsRemaining).toBe(0);
  });
});

describe("agreement invariant", () => {
  it("holds after register through the real route", async () => {
    const { buildApp } = await import("../src/app.js");
    const request = (await import("supertest")).default;
    const app = buildApp();
    const res = await request(app).post("/api/v1/seeker/auth/register").send({
      fullName: "Route Person",
      email: "route@x.test",
      password: "correct horse battery staple",
    });
    expect(res.status).toBe(201);
    expect(await registryDisagreements()).toEqual([]);
  });
});
