export const UPDATE_KINDS = ["All", "Feature", "Improvement", "Fix", "Trust"] as const;

export type UpdateKind = (typeof UPDATE_KINDS)[number];

export type PlatformUpdate = {
  id: string;
  date: string;
  kind: Exclude<UpdateKind, "All">;
  title: string;
  summary: string;
  details: string[];
};

/**
 * The first release-note registry is local so publishing an update is a small
 * content change. Its stable shape is deliberately API-friendly: this can move
 * to a paginated endpoint later without changing the page contract.
 */
export const PLATFORM_UPDATES: PlatformUpdate[] = [
  {
    id: "daylight-surfaces",
    date: "2026-08-20",
    kind: "Improvement",
    title: "Light mode now has a clearer daylight hierarchy",
    summary:
      "The page, raised surfaces, navigation, and controls now separate more cleanly without losing Cairn's warm paper character.",
    details: [
      "Brighter raised surfaces make search and work panels easier to locate.",
      "Navigation carries a defined edge and active state in both themes.",
      "Browser controls follow the selected theme instead of flashing a mismatched default.",
    ],
  },
  {
    id: "portal-sessions",
    date: "2026-08-19",
    kind: "Trust",
    title: "Candidate, recruiter, and admin sessions stay separate",
    summary:
      "Each portal now bootstraps its own session and can coexist in the same browser without overwriting another portal's state.",
    details: [
      "A session is verified by the server-owned portal route.",
      "Signing out of one portal no longer clears the others.",
      "The admin console remains a protected door rather than an obscured URL.",
    ],
  },
  {
    id: "url-search",
    date: "2026-08-18",
    kind: "Feature",
    title: "Job searches can be shared and resumed",
    summary:
      "Keywords, facets, and pagination live in the URL, so a role search survives refreshes and can be sent to a teammate.",
    details: [
      "Search state is readable and restorable on the job board.",
      "The mobile filter sheet uses the same state as the desktop rail.",
      "Legacy browse links keep their keyword when they move to the current board.",
    ],
  },
  {
    id: "approval-first-hiring",
    date: "2026-08-16",
    kind: "Trust",
    title: "Employer publishing is approval-first",
    summary:
      "Recruiters can create an account while pending, but publishing roles and opening candidate files requires administrator approval.",
    details: [
      "Pending recruiters get a clear status screen and a way to sign out.",
      "Ownership and approval are enforced again by the API on every mutation.",
      "Candidate resumes are served through short-lived, authorised links.",
    ],
  },
];

