import type { Portal } from "@jobportal/shared";

export type NavLink = { to: string; label: string };

/**
 * The primary navigation for a portal.
 *
 * One source read by both the desktop bar and the mobile sheet. Keeping two
 * hand-written copies is how a link gets added to one and forgotten in the
 * other — and the mobile copy is the one nobody looks at on a desktop.
 *
 * The portal arrives from the session or the route, never from a control: same
 * rule the API applies, and the reason this takes a parameter instead of
 * reading state itself.
 */
export function navLinksFor(portal: Portal): NavLink[] {
  switch (portal) {
    case "recruiter":
      return [
        { to: "/hire/companies", label: "Companies" },
        { to: "/hire/jobs", label: "Jobs" },
      ];
    // No admin entries yet. The console has no pages, and a nav link to a route
    // that does not exist is worse than no link — it renders a dead end, and
    // an admin jobs path in particular would collide with the pre-3A workspace
    // redirect. The console phase adds them here.
    case "admin":
      return [];
    case "seeker":
      return [
        { to: "/", label: "Home" },
        { to: "/jobs", label: "Jobs" },
        { to: "/browse", label: "Browse" },
      ];
  }
}
