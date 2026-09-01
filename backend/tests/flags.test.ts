import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { Admin } from "../src/models/admin.model.js";
import { FeatureFlag } from "../src/models/featureFlag.model.js";
import {
  flagEnabled,
  listFlags,
  resolvedFlags,
  setFlag,
} from "../src/services/flags.service.js";

async function adminRow(email: string) {
  return Admin.create({ email, fullName: "Admin", status: "active", emailVerifiedAt: new Date() });
}

describe("the flag service", () => {
  beforeEach(async () => {
    await Promise.all([FeatureFlag.init(), Admin.init()]);
  });

  it("answers the registry default when no row exists", async () => {
    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(false);
  });

  it("an override row wins, and a set is visible to the next read", async () => {
    const admin = await adminRow("flipper@admins.test");

    await setFlag("autoApproveRecruiterSignups", true, String(admin._id));

    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(true);
    expect((await resolvedFlags()).autoApproveRecruiterSignups).toBe(true);
  });

  it("listFlags resolves every registry flag and names the last flipper", async () => {
    const admin = await adminRow("listflipper@admins.test");
    await setFlag("autoApproveRecruiterSignups", true, String(admin._id));

    const flags = await listFlags();
    const entry = flags.find((flag) => flag.key === "autoApproveRecruiterSignups");

    expect(entry?.enabled).toBe(true);
    expect(entry?.default).toBe(false);
    expect(entry?.lastChangedBy).toBe("listflipper@admins.test");
    expect(entry?.lastChangedAt).not.toBeNull();
  });

  it("a stale row for a removed key is invisible", async () => {
    // A flag deleted from the registry leaves its row behind: writes of the
    // key now fail the model's enum, and reads must resolve to the default
    // rather than honor the ghost.
    await FeatureFlag.create({
      key: "autoApproveRecruiterSignups",
      enabled: true,
      lastChangedAt: new Date(),
    });
    await mongoose.connection.collection("featureflags").updateOne(
      { key: "autoApproveRecruiterSignups" },
      { $set: { key: "removedLongAgo" } },
    );

    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(false);
    // The DTO's key is the FlagKey union, which cannot carry the ghost's name
    // at the type level — this assertion is about the runtime, so the ghost
    // is held in a string rather than a literal the compiler rightly rejects.
    const ghost: string = "removedLongAgo";
    expect((await listFlags()).every((flag) => flag.key !== ghost)).toBe(true);
  });
});
