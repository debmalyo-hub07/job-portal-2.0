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
      if (surface === "session") {
        return [
          { to: "/hire/companies", label: "Companies" },
          { to: "/hire/jobs", label: "Jobs" },
        ];
      }
      // The employer landing page's own bar. Both branches were the workspace
      // pair, which was invisible for as long as `/hire` redirected an anonymous
      // visitor to the sign-in form — nobody ever rendered the public one. With
      // the landing page reachable again it offered a signed-out visitor two
      // gated routes that bounced them straight back to that form.
      //
      // Shaped like the seeker's public bar: the other portal's landing page,
      // then the pages both portals share. Sign in and Post a role are buttons
      // the navbar renders itself, so they are not repeated here.
      return [
        { to: "/", label: "For candidates" },
        { to: "/about", label: "About" },
        { to: "/help", label: "Help" },
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
          { to: "/", label: "Home" },
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
