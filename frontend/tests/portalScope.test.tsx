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
    ["/admin/companies", "recruiter"],
    ["/admin/jobs/create", "recruiter"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it("does not treat a path merely prefixed by 'hire' as recruiter", () => {
    // "/hired" must not match "/hire". Prefix checks that forget the boundary
    // are how a seeker page silently renders the recruiter signal.
    expect(portalForPath("/hired")).toBe("seeker");
    expect(portalForPath("/hiring-guide")).toBe("seeker");
    expect(portalForPath("/administrator")).toBe("seeker");
  });

  it("ignores a ?portal= query param", () => {
    // The invariant: portal is a route literal. A query param must never move it.
    const { container } = renderRoute(<Probe />, { route: "/login?portal=recruiter" });
    expect(portalOf(container)).toBe("seeker");
  });
});
