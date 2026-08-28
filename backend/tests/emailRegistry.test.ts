import { beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { EmailRegistry } from "../src/models/emailRegistry.model.js";
import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import {
  registryDisagreements,
  releaseEmail,
  reserveEmail,
} from "../src/services/emailRegistry.service.js";
import { backfillEmailRegistry } from "../src/scripts/backfill-email-registry.js";
import { reconcileEmailRegistry } from "../src/scripts/reconcile-email-registry.js";

beforeEach(async () => {
  // The unique index must exist before the first duplicate insert, or the
  // index-is-the-guarantee tests race autoIndex.
  await EmailRegistry.init();
});

/**
 * Stage 1 of the two-push rollout (see the email-identity spec): the registry
 * exists, with its backfill and reconcile scripts, and NOTHING consults it.
 * These are the pure-registry tests — model, claim/release, the index under
 * concurrency, and both scripts. The creation-site and sweeper tests land
 * with stage 2, when the sites start writing rows; they assert behaviour
 * this commit deliberately does not have yet.
 */
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
