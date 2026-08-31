import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENDERS,
  GENDER_LABELS,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
  MINOR_JOIN_YEARS,
  UNDER_AGE_MESSAGE,
  ageInYears,
  dobSchema,
  genderSchema,
  isMinor,
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

  it("accepts formatting noise and canonicalizes to E.164", () => {
    // libphonenumber parses the country out of the number itself; spacing and
    // separators are presentation, not structure.
    expect(phoneSchema.parse("+91 98765 43210")).toBe("+919876543210");
  });

  it("rejects a well-formed number that is not valid for its country", () => {
    // Twelve digits is not an Indian number, whatever the prefix claims.
    expect(phoneSchema.safeParse("+919999999999999").success).toBe(false);
  });

  it("rejects a landline — verification, the day it exists, arrives by SMS", () => {
    // A London fixed line, typed as FIXED_LINE by the metadata. (Indian
    // landlines come back type-unknown and deliberately pass — "unknown" is
    // not "landline", and over-refusing costs a real number.)
    const result = phoneSchema.safeParse("+442071234567");
    expect(result.success).toBe(false);
  });

  it("accepts a number whose line type the metadata cannot pin down", () => {
    // +91 11 is a Delhi fixed-line area code, but the core metadata types it
    // unknown — unknown must pass, or every such real number is refused.
    expect(phoneSchema.parse("+911123456789")).toBe("+911123456789");
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

  it("passes someone who turns 16 today and fails them one day short", () => {
    // Project C lowered the JOIN floor to 16; 18 is now the adult boundary
    // the minor derivation reads, not the signup rule.
    expect(dobSchema.safeParse("2010-08-26").success).toBe(true);
    expect(dobSchema.safeParse("2010-08-27").success).toBe(false);
  });

  it("refuses an under-16 date with the join-floor message", () => {
    const result = dobSchema.safeParse("2015-01-01");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(UNDER_AGE_MESSAGE);
    }
  });

  it("derives the minor band from a model Date, on the server's clock", () => {
    // 16-17 is the band; 18 the day it lifts.
    expect(isMinor(new Date("2010-01-01T00:00:00Z"))).toBe(true);
    expect(isMinor(new Date("2008-08-26T00:00:00Z"))).toBe(false);
    // No DOB yet is not a minor — incompleteness is the gate's business.
    expect(isMinor(null)).toBe(false);
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
