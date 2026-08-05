import { describe, expect, it } from "vitest";
import { buildAuthRoutes } from "@/routes/authRoutes";

describe("buildAuthRoutes", () => {
  it("mounts seeker auth at the root prefix", () => {
    const paths = buildAuthRoutes("seeker", "").map((r) => r.path);
    expect(paths).toContain("/login");
    expect(paths).toContain("/signup");
  });

  it("mounts recruiter auth under /hire", () => {
    const paths = buildAuthRoutes("recruiter", "/hire").map((r) => r.path);
    expect(paths).toContain("/hire/login");
    expect(paths).toContain("/hire/signup");
  });

  it("produces the same route count for both portals", () => {
    // One component set, two mounts — mirroring buildAuthRouter on the server.
    expect(buildAuthRoutes("seeker", "").length).toBe(
      buildAuthRoutes("recruiter", "/hire").length,
    );
  });
});
