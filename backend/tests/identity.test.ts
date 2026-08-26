import { describe, expect, it } from "vitest";
import { GENDERS } from "@jobportal/shared";
import { isProfileComplete } from "../src/services/account.service.js";
import { Seeker } from "../src/models/seeker.model.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { Admin } from "../src/models/admin.model.js";

describe("isProfileComplete", () => {
  it("is false for a seeker or recruiter with no date of birth", () => {
    expect(isProfileComplete("seeker", { dob: null })).toBe(false);
    expect(isProfileComplete("recruiter", { dob: null })).toBe(false);
  });

  it("is true once a date of birth is present", () => {
    const dob = new Date("1995-03-20T00:00:00Z");
    expect(isProfileComplete("seeker", { dob })).toBe(true);
    expect(isProfileComplete("recruiter", { dob })).toBe(true);
  });

  it("treats a missing dob field as incomplete, not as complete", () => {
    // A query that projected `dob` away hands us undefined. Reading that as
    // complete would open the gate for exactly the accounts it exists to catch.
    expect(isProfileComplete("seeker", {})).toBe(false);
    expect(isProfileComplete("recruiter", { dob: undefined })).toBe(false);
  });

  it("is true for an admin regardless", () => {
    // Nothing reads an admin's DOB, and the one account that can unblock every
    // other must not sit behind a new gate.
    expect(isProfileComplete("admin", { dob: null })).toBe(true);
  });
});

describe("identity fields on every collection", () => {
  it("defaults dob and gender to null on all three models", () => {
    for (const Model of [Seeker, Recruiter, Admin]) {
      const doc = new Model({ email: "a@b.co", fullName: "A B" });
      expect(doc.get("dob")).toBeNull();
      expect(doc.get("gender")).toBeNull();
    }
  });

  it("accepts every gender slug and refuses anything else", () => {
    for (const g of GENDERS) {
      const doc = new Seeker({ email: "a@b.co", fullName: "A B", gender: g });
      expect(doc.validateSync()?.errors.gender).toBeUndefined();
    }
    const bad = new Seeker({ email: "a@b.co", fullName: "A B", gender: "Female" });
    expect(bad.validateSync()?.errors.gender).toBeDefined();
  });

  it("leaves both fields optional so the seed scripts still create accounts", () => {
    // seed:admin and seed:catalog both create accounts with no DOB. A
    // schema-level `required` breaks both on their next run.
    const doc = new Admin({ email: "a@b.co", fullName: "A B" });
    expect(doc.validateSync()?.errors.dob).toBeUndefined();
  });
});
