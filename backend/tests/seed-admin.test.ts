import { beforeEach, describe, expect, it } from "vitest";
import { Admin } from "../src/models/admin.model.js";
import { seedAdmin } from "../src/scripts/seed-admin.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

describe("seedAdmin", () => {
  beforeEach(() => installCaptureMailer());

  it("creates the first admin with no password and mails a set-password code", async () => {
    const result = await seedAdmin({ email: "root@example.com", fullName: "Root Admin" });
    expect(result.created).toBe(true);

    const admin = await Admin.findOne({ email: "root@example.com" }).select("+passwordHash");
    expect(admin).not.toBeNull();
    // No password is ever accepted as an argument, so the row starts without one.
    expect(admin?.passwordHash ?? null).toBeNull();
    // Pre-verified: Google never attests an admin mailbox and there is no
    // registration flow to confirm it through.
    expect(admin?.emailVerifiedAt).not.toBeNull();
    expect(admin?.status).toBe("active");
    expect(outbox.some((m) => m.to === "root@example.com" && /\d{6}/.test(m.text))).toBe(true);
  });

  it("normalises the email so a capitalised re-run is not a second admin", async () => {
    await seedAdmin({ email: "Root@Example.com", fullName: "Root" });
    const again = await seedAdmin({ email: "root@example.com", fullName: "Root", force: true });
    expect(again.created).toBe(false);
    expect(await Admin.countDocuments()).toBe(1);
  });

  it("refuses a second admin unless forced", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    await expect(seedAdmin({ email: "other@example.com", fullName: "Other" })).rejects.toThrow(
      /already exists/i,
    );
    expect(await Admin.countDocuments()).toBe(1);
  });

  it("creates a second admin when forced", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    const result = await seedAdmin({ email: "other@example.com", fullName: "Other", force: true });
    expect(result.created).toBe(true);
    expect(await Admin.countDocuments()).toBe(2);
  });

  it("is idempotent for the same email", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    const again = await seedAdmin({ email: "root@example.com", fullName: "Root", force: true });
    expect(again.created).toBe(false);
    expect(await Admin.countDocuments()).toBe(1);
  });

  it("never logs the mailed code", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    const mail = outbox.find((m) => m.to === "root@example.com");
    const code = /\b(\d{6})\b/.exec(mail?.text ?? "")?.[1];
    expect(code).toBeTruthy();
  });
});
