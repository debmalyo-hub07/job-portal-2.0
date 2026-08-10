import { describe, expect, it } from "vitest";
import { paginationQuerySchema, jobTypeSchema, JOB_TYPES } from "../src/index.js";

describe("jobTypeSchema", () => {
  it("accepts a known job type", () => {
    expect(jobTypeSchema.parse("Full-time")).toBe("Full-time");
  });

  it("rejects an unknown job type", () => {
    expect(() => jobTypeSchema.parse("freelance-ish")).toThrow();
  });

  it("rejects the casing a free-text form would have produced", () => {
    // 2B-3: these values are what FilterCard matches on by exact equality, so a
    // near-miss is a row the seeker board can never surface under a filter.
    expect(() => jobTypeSchema.parse("full-time")).toThrow();
    expect(() => jobTypeSchema.parse("Full Time")).toThrow();
  });

  it("accepts every value the seeker facet offers", () => {
    for (const type of JOB_TYPES) expect(jobTypeSchema.parse(type)).toBe(type);
  });
});

describe("paginationQuerySchema", () => {
  it("applies defaults when absent", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it("coerces numeric strings from the query string", () => {
    expect(paginationQuerySchema.parse({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10 });
  });

  it("caps limit at 50 so a client cannot request the whole table", () => {
    expect(paginationQuerySchema.parse({ limit: "5000" })).toEqual({ page: 1, limit: 50 });
  });

  it("rejects a page below 1", () => {
    expect(() => paginationQuerySchema.parse({ page: "0" })).toThrow();
  });
});
