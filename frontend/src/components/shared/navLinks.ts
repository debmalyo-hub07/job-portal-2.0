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
export function navLinksFor(portal: Portal, surface: "public" | "session" = "public"): NavLink[] {
  switch (portal) {
    case "recruiter":
      return [
        { to: "/hire/companies", label: "Companies" },
        { to: "/hire/jobs", label: "Jobs" },
      ];
    // The console's sections. `AdminShell` renders these as its sub-navigation
    // and the navbar/sheet render them as primary links, so all three agree by
    // construction.
    //
    // Moderation sits under `/admin/review/*` rather than the bare jobs and
    // companies prefixes: those still belong to the pre-3A recruiter workspace
    // redirects, so an old recruiter bookmark keeps resolving into /hire.
    case "admin":
      return [
        { to: "/admin/dashboard", label: "Dashboard" },
        { to: "/admin/recruiters", label: "Recruiters" },
        { to: "/admin/review/jobs", label: "Jobs" },
        { to: "/admin/review/companies", label: "Companies" },
      ];
    // No "Browse" entry. `/browse` was the pre-4B keyword-only board and now
    // redirects to `/jobs`, which is the only seeker job list — listing both
    // advertised two boards where the second was strictly the weaker one.
    case "seeker":
      if (surface === "session") {
        return [
          { to: "/jobs", label: "Jobs" },
          { to: "/profile", label: "Profile" },
          { to: "/help", label: "Help" },
        ];
      }
      return [
        { to: "/jobs", label: "Jobs" },
        { to: "/hire", label: "For employers" },
        { to: "/about", label: "About" },
        { to: "/help", label: "Help" },
      ];
  }
}
