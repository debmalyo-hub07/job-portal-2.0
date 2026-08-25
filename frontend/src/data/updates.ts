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
 * The release-note registry is local so publishing an update is a small content
 * change. Its stable shape is deliberately API-friendly: this can move to a
 * paginated endpoint later without changing the page contract.
 *
 * A user-visible change publishes an entry HERE, in the same commit that ships
 * it. The page calls itself a running record and labels its newest entry
 * "Shipped and available", so an unpublished release does not read as an
 * omission — it reads as a claim that nothing has happened since the last row.
 * Four releases went out between 2026-08-21 and 2026-08-22, including the one
 * that built this page, and none of them ever appeared on it.
 *
 * Newest first, and that order is asserted rather than sorted: an entry appended
 * to the bottom of this array — the natural thing to do in a file — would
 * publish invisibly at the end of a list the page labels "Newest first" while
 * the hero went on showing the previous release. The test fails instead.
 */
export const PLATFORM_UPDATES: PlatformUpdate[] = [
  {
    id: "job-lifecycle",
    date: "2026-08-25",
    kind: "Feature",
    title: "Recruiters can correct, close and remove a posting",
    summary:
      "A role can be edited after it goes up, closed once it is filled, and deleted if it was posted by mistake — without disturbing anyone who already applied.",
    details: [
      "A filled role leaves the job board and stops accepting applications, while the candidates already in the pipeline stay exactly where they are.",
      "Closing is reversible, and the workspace shows how many candidates are still waiting on a decision.",
      "A posting people have applied to can be closed but never deleted, so no candidate loses the record of having applied.",
    ],
  },
  {
    id: "application-pipeline",
    date: "2026-08-25",
    kind: "Feature",
    title: "Applications move through a visible hiring pipeline",
    summary:
      "A candidate can follow an application from review to shortlist, interview and offer, and a recruiter sets the stage from the applicant list — with a dated record of every step on both sides.",
    details: [
      "Each change is timestamped, so an application shows when it moved and not only where it stands.",
      "Candidates are emailed when a decision changes something — a shortlist, an interview, an offer, or a no — and not for internal bookkeeping.",
      "An application can be withdrawn, which tells the recruiter and closes the file for good.",
    ],
  },
  {
    id: "honest-counts",
    date: "2026-08-22",
    kind: "Trust",
    title: "The homepage counts what it says it counts",
    summary:
      "Open roles, employer numbers and discipline totals are read from the marketplace itself instead of being written into the page.",
    details: [
      "Every figure derives from the thing it describes, so a new listing changes the number the same day.",
      "The page no longer says there are no openings while it is still loading them.",
      "Where a count cannot be read it declines to give one, rather than showing a zero.",
    ],
  },
  {
    id: "employer-catalogue",
    date: "2026-08-21",
    kind: "Feature",
    title: "Twenty-seven employers and 198 open roles",
    summary:
      "The marketplace now spans global product companies, Indian services firms, and consumer-internet, fintech and SaaS teams, each posting its own set of roles.",
    details: [
      "No two employers list the same roles, so the board reads as a market rather than one company repeated.",
      "Posting dates are spread across eight weeks, so the latest openings are genuinely the latest.",
      "The employer filter opens on a shortlist and expands to the full roster on request.",
    ],
  },
  {
    id: "search-suggestions",
    date: "2026-08-21",
    kind: "Fix",
    title: "Search suggestions stay open",
    summary:
      "Clicking the search box on the homepage or the job board flashed the suggestion list open and shut. It stays open now.",
    details: [
      "Suggestions cover roles, employers, skills, locations and disciplines.",
      "The list closes when you click away from it, and not before.",
      "Corrected on the homepage search and the job board search together.",
    ],
  },
  {
    id: "department-facets",
    date: "2026-08-21",
    kind: "Feature",
    title: "Roles can be found by discipline, not only by location",
    summary:
      "Every role carries a department, the board can be narrowed by it, and a keyword now reaches the employer name, the location and the skills a role asks for.",
    details: [
      "Roles are filed under a discipline — engineering, data, design, consulting, finance, legal and more — so a candidate outside engineering has something to browse and a way to ask for it.",
      "A multi-word search narrows rather than widens — every term has to match.",
      "Salary and experience ceilings keep a no-limit option, so one filter can be lifted without clearing the rest.",
    ],
  },
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

