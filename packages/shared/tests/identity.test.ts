import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENDERS,
  GENDER_LABELS,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
  UNDER_AGE_MESSAGE,
  ageInYears,
  dobSchema,
  genderSchema,
  phoneSchema,
  registerBodySchema,
} from "../src/index.js";

describe("gender", () => {
  it("accepts every slug and rejects anything else", () => {
    for (const g of GENDERS) expect(genderSchema.parse(g)).toBe(g);
    expect(genderSchema.safeParse("Female").success).toBe(false);
    expect(genderSchema.safeParse("").success).toBe(false);
  });

  it("has a display label for every slug", () => {
    // Guards the enum gaining a value with no label, which renders blank.
    for (const g of GENDERS) expect(GENDER_LABELS[g]).toMatch(/\S/);
    expect(Object.keys(GENDER_LABELS).sort()).toEqual([...GENDERS].sort());
  });
});

describe("phone", () => {
  it("requires E.164", () => {
    expect(phoneSchema.parse(" +919876543210 ")).toBe("+919876543210");
    expect(phoneSchema.safeParse("9876543210").success).toBe(false);
    expect(phoneSchema.safeParse("+0123456789").success).toBe(false);
  });
});

describe("ageInYears", () => {
  it("does not credit a birthday that has not arrived", () => {
    expect(ageInYears("2000-06-15", new Date("2018-06-14T00:00:00Z"))).toBe(17);
    expect(ageInYears("2000-06-15", new Date("2018-06-15T00:00:00Z"))).toBe(18);
  });

  it("reads both sides in UTC", () => {
    // A local-time reading would shift this by a day west of Greenwich and
    // silently turn an 18th birthday into 17.
    expect(ageInYears("2007-01-01", new Date("2025-01-01T00:30:00Z"))).toBe(18);
  });
});

describe("dobSchema", () => {
  // Pinned: a real clock makes the boundary assertions wrong for one day a year.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("accepts a plausible adult date of birth", () => {
    expect(dobSchema.parse("1995-03-20")).toBe("1995-03-20");
  });

  it("passes someone who turns 18 today and fails them one day short", () => {
    expect(dobSchema.safeParse("2008-08-26").success).toBe(true);
    expect(dobSchema.safeParse("2008-08-27").success).toBe(false);
  });

  it("refuses an under-age date with the internships message", () => {
    const result = dobSchema.safeParse("2015-01-01");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(UNDER_AGE_MESSAGE);
    }
  });

  it("rejects a future date, a non-date and a malformed string", () => {
    expect(dobSchema.safeParse("2030-01-01").success).toBe(false);
    // Date rolls Feb 31 forward to Mar 2 rather than rejecting it, so the
    // round-trip check in isRealCalendarDate is what catches this.
    expect(dobSchema.safeParse("2000-02-31").success).toBe(false);
    expect(dobSchema.safeParse("20-03-1995").success).toBe(false);
    expect(dobSchema.safeParse("").success).toBe(false);
  });

  it("rejects an implausible age above the maximum", () => {
    expect(dobSchema.safeParse("1900-01-01").success).toBe(false);
    expect(MIN_AGE_YEARS).toBe(18);
    expect(MAX_AGE_YEARS).toBe(100);
  });
});

describe("registerBodySchema", () => {
  it("no longer accepts phone, which moved to the completion step", () => {
    // A Google registration never sees the signup form, so phone-at-signup only
    // ever worked for password registrations. The completion step is where both
    // paths meet.
    const body = { fullName: "A B", email: "a@b.co", password: "correct horse battery" };
    expect(registerBodySchema.safeParse(body).success).toBe(true);
    expect(registerBodySchema.safeParse({ ...body, phone: "+919876543210" }).success).toBe(false);
  });
});
