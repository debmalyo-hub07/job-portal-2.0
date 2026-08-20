import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

describe("PortalScope mirrors the portal onto <html>", () => {
  // Radix renders Dialog, DropdownMenu, Select, Popover, Sheet and Tooltip — and
  // Sonner its toaster — into a portal on document.body, which is a *sibling* of
  // the PortalScope div rather than a descendant. Custom properties inherit down
  // the DOM, not the React tree, so before this every overlay in the app took its
  // signal tokens from <html> and rendered seeker's teal in the gold workspace and
  // the rose console. <html> is the only element they can inherit from, so the
  // attribute has to be there as well as on the wrapper.
  afterEach(() => {
    delete document.documentElement.dataset.portal;
  });

  it.each([
    ["/", "seeker"],
    ["/hire", "recruiter"],
    ["/admin", "admin"],
  ])("%s sets data-portal=%s on documentElement", (route, expected) => {
    renderRoute(<Probe />, { route });
    expect(document.documentElement.dataset.portal).toBe(expected);
  });

  it("keeps <html> and the wrapper in agreement", () => {
    // Two writers of one value is a drift risk, so the agreement is asserted
    // rather than assumed: an overlay and the page behind it must never disagree
    // about which portal they are in.
    const { container } = renderRoute(<Probe />, { route: "/hire" });
    expect(document.documentElement.dataset.portal).toBe(portalOf(container));
  });

  it("follows a navigation between portals", () => {
    renderRoute(<Probe />, { route: "/admin" });
    expect(document.documentElement.dataset.portal).toBe("admin");
    cleanup();
    renderRoute(<Probe />, { route: "/jobs" });
    expect(document.documentElement.dataset.portal).toBe("seeker");
  });
});
