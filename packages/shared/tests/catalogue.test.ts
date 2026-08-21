import { describe, expect, it } from "vitest";
import {
  CATALOGUE_CITIES,
  CATALOGUE_COMPANIES,
  CATALOGUE_COMPANY_NAMES,
  CATALOGUE_ROLES,
  JOB_DEPARTMENTS,
  JOB_LOCATIONS,
  JOB_TYPES,
  catalogueListings,
} from "../src/index.js";

/**
 * The seeded catalogue.
 *
 * These are the invariants that decide whether the board *works*, not whether it
 * looks full. Every one of them has a silent failure mode: a city outside the
 * facet vocabulary, a department outside the enum, or a duplicate title within
 * one employer produces no error anywhere — just a filter that returns nothing,
 * or a re-seed that creates rows instead of updating them.
 */
describe("the catalogue roster", () => {
  it("spans all three kinds of employer", () => {
    // A board of nothing but global product companies misrepresents the market
    // this portal is for. The roster is meant to carry services firms and
    // consumer-internet companies too, and nothing else here would notice if
    // one of those groups were dropped.
    const kinds = new Set(CATALOGUE_COMPANIES.map((company) => company.kind));
    expect([...kinds].sort()).toEqual(["newEconomy", "product", "services"]);
  });

  it("has a unique key and a unique name per employer", () => {
    // The seed upserts on name, and the board's facet filters on it.
    expect(new Set(CATALOGUE_COMPANIES.map((c) => c.key)).size).toBe(CATALOGUE_COMPANIES.length);
    expect(new Set(CATALOGUE_COMPANY_NAMES).size).toBe(CATALOGUE_COMPANIES.length);
  });

  it("places every employer in a city the location facet offers", () => {
    // `location` is filtered by exact equality, so "Gurugram" or "Noida" would
    // be seeded as jobs no location filter can reach. Both are "Delhi NCR".
    for (const company of CATALOGUE_COMPANIES) {
      expect(JOB_LOCATIONS).toContain(company.location);
    }
    for (const city of CATALOGUE_CITIES) expect(JOB_LOCATIONS).toContain(city);
  });

  it("points every logo at the served asset directory", () => {
    for (const company of CATALOGUE_COMPANIES) {
      expect(company.logo).toMatch(/^\/images\/companies\/[a-z0-9-]+\.(png|svg)$/);
    }
  });

  it("gives every employer a curated subset of roles, never the whole pool", () => {
    for (const company of CATALOGUE_COMPANIES) {
      expect(company.roles.length).toBeGreaterThanOrEqual(5);
      expect(company.roles.length).toBeLessThan(CATALOGUE_ROLES.length);
    }
  });

  it("never lists the same role twice for one employer", () => {
    // The seed's idempotency check matches on (owner, company, title), so a
    // repeated role would be created once and then skipped forever — the second
    // listing would silently never exist.
    for (const company of CATALOGUE_COMPANIES) {
      expect(new Set(company.roles).size).toBe(company.roles.length);
    }
  });

  it("gives no two employers an identical role set", () => {
    // The failure this replaced: nine companies posting the same ten titles.
    const signatures = CATALOGUE_COMPANIES.map((company) => [...company.roles].sort().join("|"));
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("the catalogue role pool", () => {
  it("has a unique key per role", () => {
    expect(new Set(CATALOGUE_ROLES.map((role) => role.key)).size).toBe(CATALOGUE_ROLES.length);
  });

  it("is posted in full — no role sits in the pool unused", () => {
    const posted = new Set(CATALOGUE_COMPANIES.flatMap((company) => company.roles));
    const orphans = CATALOGUE_ROLES.filter((role) => !posted.has(role.key)).map((role) => role.key);
    expect(orphans).toEqual([]);
  });

  it("references only roles that exist", () => {
    const keys = new Set(CATALOGUE_ROLES.map((role) => role.key));
    for (const company of CATALOGUE_COMPANIES) {
      for (const role of company.roles) expect(keys).toContain(role);
    }
  });

  it("uses only departments and job types the enums allow", () => {
    for (const role of CATALOGUE_ROLES) {
      expect(JOB_DEPARTMENTS).toContain(role.department);
      if (role.jobType) expect(JOB_TYPES).toContain(role.jobType);
    }
  });

  it("covers every department except the Other fallback", () => {
    const covered = new Set(CATALOGUE_ROLES.map((role) => role.department));
    const missing = JOB_DEPARTMENTS.filter((department) => department !== "Other" && !covered.has(department));
    expect(missing).toEqual([]);
  });
});

describe("catalogueListings", () => {
  const listings = catalogueListings();

  it("expands to one listing per employer role", () => {
    const expected = CATALOGUE_COMPANIES.reduce((total, company) => total + company.roles.length, 0);
    expect(listings).toHaveLength(expected);
  });

  it("is deterministic, so re-seeding updates rather than duplicates", () => {
    expect(catalogueListings()).toEqual(listings);
  });

  it("keeps every band a positive whole number of lakh", () => {
    // `Math.round` of a factor below 1 can reach zero from a low base — an
    // internship at a services multiplier — and a zero band reads as unpaid.
    for (const listing of listings) {
      expect(Number.isInteger(listing.salary)).toBe(true);
      expect(listing.salary).toBeGreaterThan(0);
    }
  });

  it("never marks an on-site role remote", () => {
    const onsiteTitles = new Set(CATALOGUE_ROLES.filter((role) => role.onsite).map((role) => role.title));
    for (const listing of listings) {
      if (onsiteTitles.has(listing.title)) expect(listing.remote).toBe(false);
    }
  });

  it("produces at least one listing of every job type", () => {
    // Part-time, Contract and Internship facets returned an empty board for as
    // long as the catalogue posted nothing but full-time roles.
    const types = new Set(listings.map((listing) => listing.jobType));
    for (const type of JOB_TYPES) expect(types).toContain(type);
  });

  it("gives every listing its own posting time", () => {
    // The board sorts by createdAt descending. Shared timestamps make that sort
    // arbitrary, and pagination unstable along with it.
    const stamps = listings.map((listing) => listing.postedHoursAgo);
    expect(new Set(stamps).size).toBe(listings.length);
    expect(Math.min(...stamps)).toBe(0);
  });

  it("puts a different employer in each of the newest slots", () => {
    // What this prevents: the landing page's "latest openings" showing six cards
    // from whichever employer the seed reached last.
    const newest = [...listings].sort((a, b) => a.postedHoursAgo - b.postedHoursAgo).slice(0, 6);
    expect(new Set(newest.map((listing) => listing.companyKey)).size).toBe(6);
  });

  it("puts a different role in each of the newest slots too", () => {
    // Distinct employers is not enough: many employers open their list with an
    // engineering role, so the newest cards came back with the same title and
    // the same description repeated down the page.
    const newest = [...listings].sort((a, b) => a.postedHoursAgo - b.postedHoursAgo).slice(0, 6);
    expect(new Set(newest.map((listing) => listing.title)).size).toBe(6);
  });

  it("still posts every curated role after the rotation", () => {
    // Rotating the list must reorder it, not drop or repeat anything.
    for (const company of CATALOGUE_COMPANIES) {
      const posted = listings.filter((listing) => listing.companyKey === company.key);
      expect(posted).toHaveLength(company.roles.length);
      expect(new Set(posted.map((listing) => listing.title)).size).toBe(company.roles.length);
    }
  });

  it("spreads posting times over weeks rather than one instant", () => {
    const oldestDays = Math.max(...listings.map((listing) => listing.postedHoursAgo)) / 24;
    expect(oldestDays).toBeGreaterThan(14);
  });

  it("throws on a role reference the pool cannot satisfy", () => {
    const [company] = CATALOGUE_COMPANIES;
    if (!company) throw new Error("expected a roster");
    const original = [...company.roles];
    company.roles.push("no-such-role");
    try {
      expect(() => catalogueListings()).toThrow(/no-such-role/);
    } finally {
      company.roles.splice(0, company.roles.length, ...original);
    }
  });
});
