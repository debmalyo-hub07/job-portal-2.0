import { describe, expect, it } from "vitest";
import { paginationQuerySchema, jobTypeSchema } from "../src/index.js";

describe("jobTypeSchema", () => {
  it("accepts a known job type", () => {
    expect(jobTypeSchema.parse("full-time")).toBe("full-time");
  });

  it("rejects an unknown job type", () => {
    expect(() => jobTypeSchema.parse("freelance-ish")).toThrow();
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
