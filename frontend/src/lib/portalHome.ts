import type { Portal } from "@jobportal/shared";

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
      return pathname === "/profile" ? from : null;
    case "recruiter":
      return /^\/hire\/(?:companies|jobs)(?:\/|$)/.test(pathname) ? from : null;
    case "admin":
      return /^\/admin\/(?:dashboard|recruiters|review\/(?:jobs|companies))(?:\/|$)/.test(pathname)
        ? from
        : null;
  }
}
