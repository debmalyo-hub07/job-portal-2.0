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

  it("ignores a ?portal= query param on a portal-owned path", () => {
    // The invariant: on a path a portal owns, portal is a route literal, and a
    // query param must never move it. `/login` is seeker's own sign-in.
    const { container } = renderRoute(<Probe />, {
      route: "/login?portal=recruiter",
      path: "/login",
    });
    expect(portalOf(container)).toBe("seeker");
  });

  it("ignores a ?portal= query param inside a prefixed portal", () => {
    // The workspace and the console are the cases that matter most: repainting
    // either from a hand-edited URL is the defect the allowlist exists to prevent.
    expect(portalForPath("/hire/companies", "?portal=seeker")).toBe("recruiter");
    expect(portalForPath("/admin/dashboard", "?portal=seeker")).toBe("admin");
    expect(portalForPath("/jobs", "?portal=admin")).toBe("seeker");
  });
});

/**
 * The seven shared auth pages sit on portal-neutral paths and carry the portal
 * in `?portal=`, because the Google callback redirects to paths that name no
 * portal. Every one of them already resolves its copy, its API endpoint and its
 * wordmark suffix from that param through `usePortalParam` — only the *colour*
 * did not, because PortalScope read the path alone.
 *
 * So a recruiter verifying their email got seeker's teal on a page whose
 * headline said "Hire without the noise", and the admin console's own recovery
 * screen did the same. Not a contrast failure and not a broken flow, which is
 * why it survived: every token resolved to a legal value, just the wrong
 * portal's.
 */
describe("portalForPath reads ?portal= on the portal-neutral auth paths", () => {
  const NEUTRAL = [
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/auth/complete",
    "/auth/link-pending",
    "/auth/confirm-google-link",
    "/auth/error",
  ];

  it.each(NEUTRAL)("%s follows the param through all three portals", (path) => {
    expect(portalForPath(path, "?portal=seeker")).toBe("seeker");
    expect(portalForPath(path, "?portal=recruiter")).toBe("recruiter");
    expect(portalForPath(path, "?portal=admin")).toBe("admin");
  });

  it("falls back to seeker when the param is absent, empty or junk", () => {
    // The backend redirects to /auth/link-pending with no param at all, and a
    // hand-edited value must degrade rather than travel — the same guarantee
    // usePortalParam makes, because both now share one parser.
    expect(portalForPath("/verify-email")).toBe("seeker");
    expect(portalForPath("/verify-email", "")).toBe("seeker");
    expect(portalForPath("/verify-email", "?portal=")).toBe("seeker");
    expect(portalForPath("/verify-email", "?portal=../../admin")).toBe("seeker");
    expect(portalForPath("/verify-email", "?portal=ADMIN")).toBe("seeker");
  });

  it("does not extend the exception to a path merely prefixed by a neutral one", () => {
    // "/reset-password-help" is not "/reset-password". The same segment-boundary
    // rule the portal prefixes answer to.
    expect(portalForPath("/reset-password-help", "?portal=admin")).toBe("seeker");
    expect(portalForPath("/auth/errors", "?portal=admin")).toBe("seeker");
  });

  // PortalScope mirrors onto <html>, which outlives a render — see the block
  // below, which cleans up for the same reason.
  afterEach(() => {
    delete document.documentElement.dataset.portal;
  });

  it("paints the scope, not just the copy", () => {
    // The end-to-end property: the attribute the signal tokens resolve off must
    // agree with the portal the page's own copy came from.
    const { container } = renderRoute(<Probe />, {
      route: "/verify-email?portal=recruiter&email=a%40b.test",
      path: "/verify-email",
    });
    expect(portalOf(container)).toBe("recruiter");
    expect(document.documentElement.dataset.portal).toBe("recruiter");
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
