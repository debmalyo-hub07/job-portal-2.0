import { describe, expect, it } from "vitest";
import { portalForPath } from "@/lib/portalRoutes";
import { Probe, portalOf, renderRoute } from "./helpers/renderRoute";

describe("portalForPath", () => {
  it.each([
    ["/", "seeker"],
    ["/login", "seeker"],
    ["/signup", "seeker"],
    ["/jobs", "seeker"],
    ["/profile", "seeker"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it.each([
    ["/hire", "recruiter"],
    ["/hire/login", "recruiter"],
    ["/hire/signup", "recruiter"],
    // The workspace moved off /admin in Phase 3A — /admin is the admin portal
    // now, and these live under /hire with the rest of the recruiter surface.
    ["/hire/companies", "recruiter"],
    ["/hire/jobs/create", "recruiter"],
    ["/hire/jobs/123/applicants", "recruiter"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it.each([
    ["/admin", "admin"],
    ["/admin/login", "admin"],
    ["/admin/console/recruiters", "admin"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it("does not treat a path merely prefixed by 'hire' as recruiter", () => {
    // "/hired" must not match "/hire". Prefix checks that forget the boundary
    // are how a seeker page silently renders the recruiter signal.
    expect(portalForPath("/hired")).toBe("seeker");
    expect(portalForPath("/hiring-guide")).toBe("seeker");
    expect(portalForPath("/administrator")).toBe("seeker");
    expect(portalForPath("/admins")).toBe("seeker");
  });

  it("ignores a ?portal= query param", () => {
    // The invariant: portal is a route literal. A query param must never move it.
    const { container } = renderRoute(<Probe />, { route: "/login?portal=recruiter" });
    expect(portalOf(container)).toBe("seeker");
  });
});
