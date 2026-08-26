import { portalSchema, type Portal } from "@jobportal/shared";

/**
 * Route prefix → portal.
 *
 * The prefixes are disjoint, so order is not significant, but the
 * segment-boundary match is: a bare `startsWith("/hire")` would claim "/hired",
 * and `startsWith("/admin")` would claim "/administrator". Getting that wrong
 * silently renders one portal's signal colour on another portal's page.
 *
 * `/admin` belongs to the admin portal as of Phase 3A. The recruiter workspace
 * that used to live there moved to `/hire/*`, so the whole recruiter surface —
 * marketing, auth and workspace — now sits under one prefix.
 */
const PREFIXES: ReadonlyArray<readonly [string, Portal]> = [
  ["/admin", "admin"],
  ["/hire", "recruiter"],
];

/**
 * The paths that name no portal and carry it in `?portal=` instead.
 *
 * These are the seven shared auth pages. They are not built by
 * `buildAuthRoutes`, so they have no portal prefix to read: the Google callback
 * and every OTP link redirect to portal-neutral paths, and duplicating the
 * pages per portal would require a backend change.
 *
 * Exact matches, deliberately — no prefix rule. "/reset-password-help" is not
 * "/reset-password", and the exception must not widen by accident the way a
 * `startsWith` prefix check would let it.
 */
const PORTAL_NEUTRAL_PATHS: ReadonlySet<string> = new Set([
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/complete",
  "/auth/link-pending",
  "/auth/confirm-google-link",
  "/auth/error",
]);

/**
 * The `?portal=` query parameter, validated. Never the raw string.
 *
 * Validation goes through `portalSchema`, not a hand-written comparison. The
 * previous version of the hook that wrapped this read
 * `=== "recruiter" ? "recruiter" : "seeker"`, written when there were two
 * portals; 3A added the third and did not revisit it, so every `?portal=admin`
 * link resolved to `seeker` — silently, because the endpoints those pages call
 * are deliberately non-committal about whether an account exists. An admin
 * following "Forgot password?" got a uniform success and no email. Deriving the
 * set from the schema means a fourth portal cannot reintroduce this.
 *
 * Accepts a search string rather than a `URLSearchParams` so the router's
 * `location.search` and a hook's `useSearchParams` can share one parser.
 */
export function portalFromSearch(search: string | URLSearchParams): Portal {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const parsed = portalSchema.safeParse(params.get("portal"));
  return parsed.success ? parsed.data : "seeker";
}

/**
 * The portal a URL belongs to — the value the signal tokens resolve off.
 *
 * The path decides, except on the seven portal-neutral auth paths, where there
 * is no path to decide *from* and `?portal=` is the portal. Reading the param
 * everywhere would be wrong in the other direction: `/hire/companies?portal=seeker`
 * must stay gold, or a hand-edited URL repaints the workspace.
 *
 * Consulting the param on those seven paths is not a weakening of "portal is a
 * route literal". Those pages already resolve their copy, their API endpoint and
 * their wordmark suffix from this exact value through `usePortalParam` — the
 * colour was the one thing that did not follow, so a recruiter verifying their
 * email read "Hire without the noise" in seeker's teal and the console's own
 * recovery screen did the same. Nothing here authorizes anything; the portal
 * that gates a request is still the server-owned mount the API is called on.
 */
export function portalForPath(pathname: string, search: string | URLSearchParams = ""): Portal {
  for (const [prefix, portal] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return portal;
  }
  if (PORTAL_NEUTRAL_PATHS.has(pathname)) return portalFromSearch(search);
  return "seeker";
}
