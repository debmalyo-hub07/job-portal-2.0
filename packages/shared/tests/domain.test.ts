import { describe, expect, it } from "vitest";
import {
  applicationStatusBodySchema,
  companyCreateBodySchema,
  jobCreateBodySchema,
  jobListQuerySchema,
  objectIdSchema,
} from "../src/domain.js";

describe("domain schemas", () => {
  it("rejects a malformed object id", () => {
    expect(objectIdSchema.safeParse("not-an-id").success).toBe(false);
    expect(objectIdSchema.safeParse("64b0c8f2a9d3e45f6a7b8c9d").success).toBe(true);
  });

  it("company create requires a trimmed name", () => {
    expect(companyCreateBodySchema.safeParse({ name: "  " }).success).toBe(false);
    const ok = companyCreateBodySchema.parse({ name: "  Acme  " });
    expect(ok.name).toBe("Acme");
  });

  it("job create coerces salary and splits requirements", () => {
    const ok = jobCreateBodySchema.parse({
      title: "Dev", description: "Build things", requirements: "ts, node ,",
      salary: "12", experience: "2", location: "Remote", jobType: "Full-time",
      position: "2", companyId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(ok.salary).toBe(12);
    expect(ok.requirements).toEqual(["ts", "node"]);
  });

  it("job list query defaults and caps", () => {
    const q = jobListQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, limit: 20, keyword: "" });
    expect(jobListQuerySchema.safeParse({ keyword: "a".repeat(200) }).success).toBe(false); // see max below
    expect(jobListQuerySchema.safeParse({ keyword: "a".repeat(101) }).success).toBe(false);
  });

  it("status accepts only accepted/rejected", () => {
    expect(applicationStatusBodySchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(applicationStatusBodySchema.parse({ status: "accepted" }).status).toBe("accepted");
  });
});
