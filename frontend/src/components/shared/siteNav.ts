import type { NavLink } from "./navLinks";

export type NavColumn = { heading: string; links: NavLink[] };

/**
 * The footer's navigation, and the only list of the public informational pages.
 *
 * Why a registry rather than markup: `publicPages.test.tsx` asserts that every
 * informational route is both mounted and linked, and it reads this. A page
 * added to the route table but not to a column fails that test rather than
 * shipping as an orphan — which is what /jobs was for a whole phase, mounted and
 * linked from nothing.
 *
 * Deliberately not portal-scoped. The footer is the same on every surface
 * because a privacy policy does not change by who is reading it, and the
 * seeker/employer split here is signposting rather than access control.
 */
export const FOOTER_COLUMNS: NavColumn[] = [
  {
    heading: "For candidates",
    links: [
      { to: "/jobs", label: "Browse jobs" },
      { to: "/signup", label: "Create an account" },
      { to: "/login", label: "Candidate sign in" },
    ],
  },
  {
    heading: "For employers",
    links: [
      { to: "/hire", label: "Hire on Cairn" },
      { to: "/hire/signup", label: "Post a role" },
      { to: "/hire/login", label: "Employer sign in" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
      { to: "/help", label: "FAQ" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
    ],
  },
];

/**
 * Public paths that render outside any portal gate.
 *
 * `appRoutes` mounts these under `PublicLayout`; the array exists so the route
 * table and the tests agree on what "public informational page" means without
 * either restating it.
 */
export const INFO_PATHS = ["/about", "/contact", "/privacy", "/terms", "/help"] as const;
