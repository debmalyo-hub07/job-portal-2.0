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
      return "/";
  }
}
