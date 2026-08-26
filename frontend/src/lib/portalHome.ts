import type { Portal, SessionUser } from "@jobportal/shared";

/**
 * Where a portal's user belongs after signing in.
 *
 * One function rather than a ternary at each call site: `Login.tsx` had the
 * mapping twice (submit handler and the already-signed-in effect), both reading
 * `portal === "recruiter" ? "/hire/companies" : "/"`. That sent an **admin** to
 * the seeker job board — a real 3A gap that survived because fixing one copy
 * looks complete.
 *
 * Seekers land on the board itself: it is the product for them, and there is no
 * seeker dashboard to route to instead.
 */
export function homePathFor(portal: Portal): string {
  switch (portal) {
    case "recruiter":
      return "/hire/companies";
    case "admin":
      return "/admin/dashboard";
    case "seeker":
      return "/jobs";
  }
}

/**
 * Where a portal completes its identity.
 *
 * Typed over the two GATED portals rather than `Portal`, so passing "admin" is a
 * compile error rather than a path with no route behind it — admin is ungated by
 * design and has no completion screen.
 *
 * Two paths rather than one `?portal=` screen: a browser can hold a seeker and a
 * recruiter session simultaneously — the redux slice is keyed per portal — so a
 * shared path could not tell which one it was completing.
 */
export function completePathFor(portal: Extract<Portal, "seeker" | "recruiter">): string {
  return portal === "recruiter" ? "/hire/complete-profile" : "/complete-profile";
}

/** Where each portal reads and edits its own account. */
export function profilePathFor(portal: Portal): string {
  switch (portal) {
    case "recruiter":
      return "/hire/profile";
    case "admin":
      return "/admin/profile";
    case "seeker":
      return "/profile";
  }
}

/**
 * The single destination for every post-authentication navigation.
 *
 * Without this the completion step is not first. `AuthComplete` sent a Google
 * registration to `homePathFor(portal)`, and for a seeker that is `/jobs` — so a
 * Google seeker sailed past the identity step and met the gate for the first time
 * on their first application, as a 403.
 *
 * One function rather than a ternary at each call site: the same lesson
 * `homePathFor` records, where two copies of the mapping sent an admin to the
 * seeker job board.
 *
 * The `!== "admin"` is belt-and-braces over `isProfileComplete`, which already
 * returns true for every admin. A stale cached session claiming otherwise would
 * otherwise route an admin to a route that does not exist.
 */
export function landingAfterAuth(user: SessionUser): string {
  if (!user.profileComplete && user.portal !== "admin") {
    return completePathFor(user.portal);
  }
  return homePathFor(user.portal);
}

/**
 * Where a successful login navigates, `from` included.
 *
 * The precedence matters and belongs here rather than at the call site: a saved
 * `from` must NOT win over an unfinished identity step. Returning an incomplete
 * session to the page it came from puts the completion step behind whatever it
 * was trying to do, and `RequireProfileComplete` bounces it straight back — a
 * redirect loop the user experiences as the app refusing to load a page.
 */
export function loginDestination(user: SessionUser, state: unknown): string {
  const landing = landingAfterAuth(user);
  if (!user.profileComplete && user.portal !== "admin") return landing;
  return returnPathFor(user.portal, state) ?? landing;
}

/** Portal destination represented by a signed-in wordmark and Home link. */
export function landingPathFor(portal: Portal): string {
  switch (portal) {
    case "recruiter":
      return "/hire/companies";
    case "admin":
      return "/admin/dashboard";
    case "seeker":
      return "/";
  }
}

export function loginPathFor(portal: Portal): string {
  switch (portal) {
    case "recruiter":
      return "/hire/login";
    case "admin":
      return "/admin/login";
    case "seeker":
      return "/login";
  }
}

/**
 * Reads the internal path saved by ProtectedRoute without accepting an open
 * redirect or a route owned by another portal.
 */
export function returnPathFor(portal: Portal, state: unknown): string | null {
  if (!state || typeof state !== "object" || !("from" in state)) return null;
  const from = (state as { from?: unknown }).from;
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return null;

  const pathname = from.split(/[?#]/, 1)[0] ?? "";
  switch (portal) {
    case "seeker":
      return pathname === "/profile" ||
        pathname === "/complete-profile" ||
        /^\/description\/[^/]+$/.test(pathname)
        ? from
        : null;
    case "recruiter":
      return /^\/hire\/(?:companies|jobs|profile|complete-profile)(?:\/|$)/.test(pathname)
        ? from
        : null;
    case "admin":
      return /^\/admin\/(?:dashboard|recruiters|profile|review\/(?:jobs|companies))(?:\/|$)/.test(
        pathname,
      )
        ? from
        : null;
  }
}
