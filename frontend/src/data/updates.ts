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
    id: "google-address-taken",
    date: "2026-08-28",
    kind: "Fix",
    title: "Signing in with Google now says when an address already has an account",
    summary:
      "Trying Google sign-in with an address that already holds an account used to end on the same unexplained failure as a security check refusing you. It now says the address is taken and to sign in with your password.",
    details: [
      "One address holds exactly one account across the candidate, employer and administrator portals — Google cannot create a second, so it is refused.",
      "Until now that refusal was indistinguishable from any other failed Google flow, leaving the address's owner with a dead end.",
      "The message matches what sign-up already answers for the same situation, so nothing new is revealed by saying it here.",
    ],
  },
  {
    id: "google-signup-and-linking",
    date: "2026-08-28",
    kind: "Fix",
    title: "Google signup now follows the same account rules as password signup",
    summary:
      "Candidates and employers can now start with Google directly from signup, while existing password accounts can securely connect the same Google address.",
    details: [
      "Google is available on both candidate and employer signup pages; administrator accounts remain password-only.",
      "A new employer created with Google enters the normal pending-approval state and cannot bypass administrator approval.",
      "An existing verified password account still confirms a mailbox link before Google is attached, preventing silent account takeover.",
      "The one-address-one-account rule continues to apply across candidate, employer and administrator portals.",
    ],
  },
  {
    id: "account-menu-closes",
    date: "2026-08-28",
    kind: "Fix",
    title: "The account menu no longer lingers over the page it sent you to",
    summary:
      "Opening the avatar menu and clicking View profile used to leave the menu floating over the profile page until you clicked somewhere else. It now closes as soon as you navigate.",
    details: [
      "Affected every portal — the account menu is how each of the three profiles is reached — and was easiest to hit as a candidate, where the top bar stays mounted across pages.",
      "The menu now closes on the click itself, the same behaviour the mobile menu already had.",
    ],
  },
  {
    id: "oversight-and-queues",
    date: "2026-08-27",
    kind: "Trust",
    title: "Oversight queues: suspension with a reason, and one applicants queue",
    summary:
      "Admins can now suspend and reinstate any candidate or recruiter — with a reason the account's owner sees at sign-in — and employers get a single queue of every applicant across all their roles.",
    details: [
      "The Recruiters screen shows every recruiter on the platform, not just those awaiting approval, with Suspend on active rows and Reinstate on suspended ones.",
      "A new Candidates screen lists every candidate, including who is under 18, with the same actions.",
      "Suspending requires a reason. The owner sees it only after entering the correct password — a stranger guessing at an address still gets the ordinary 'Incorrect email or password'.",
      "A suspended employer's job listings stay on the board but stop accepting applications; reinstating restores everything untouched.",
      "Every approval, denial, suspension and reinstatement is recorded per account, with the reason and the acting admin, viewable from both screens.",
      "The workspace's new Applicants page shows every application to every role an employer owns, newest first, linking to each role's own ranked list.",
    ],
  },
  {
    id: "under-18-internships",
    date: "2026-08-27",
    kind: "Feature",
    title: "16 and 17 year olds can join, with a guardian's OK",
    summary:
      "Candidates aged 16-17 can now create an account with guardian consent, and apply to internship roles.",
    details: [
      "Signing up is unchanged; the date-of-birth step now accepts 16 and 17 with a guardian's confirmation instead of refusing everyone under 18.",
      "The guardian receives a 6-digit code by email, entered on the candidate's screen — consent is verified, not just typed.",
      "Accounts under 18 can apply to internship roles only. Every other role explains this on the page instead of failing at the submit button.",
      "Employer accounts remain 18 and over, as before.",
      "Under-16 remains a refusal; the join floor is 16.",
    ],
  },
  {
    id: "one-address-one-account",
    date: "2026-08-27",
    kind: "Trust",
    title: "One email address, one account — and the address can change",
    summary:
      "An email address now belongs to exactly one account across the candidate, employer and admin sides of Cairn, and you can change the address on your own account from your profile.",
    details: [
      "Signing up with an address that already has an account on any side is refused. Previously the same address could hold a candidate account and an employer account at the same time.",
      "The email row on your profile has a Change action. It asks for your password when your account has one, then a code sent to the new address before anything moves.",
      "Admin accounts confirm a code on their current address before the new one is even mailed — the highest-privilege account needs both the password and the mailbox it is leaving.",
      "Completing a change signs you out everywhere, including the session that made the change, and the new address becomes the one you sign in with.",
      "The old address is released the moment a change completes, and can be registered by anyone from then on.",
    ],
  },
  {
    id: "single-profile-navigation",
    date: "2026-08-27",
    kind: "Fix",
    title: "Account pages have one navigation bar",
    summary:
      "Profile completion and recruiter account pages no longer repeat the site header above the page they already belong to.",
    details: [
      "The candidate identity step now uses the shared public navigation supplied by its route instead of mounting a second copy.",
      "The recruiter account page now lives with the hiring workspace surfaces, whose shell already provides its navigation and workspace links.",
      "Pending recruiters can still reach their account page and read their approval state.",
    ],
  },
  {
    id: "identity-and-profiles",
    date: "2026-08-26",
    kind: "Feature",
    title: "Your account, filled in",
    summary:
      "Every account now carries a date of birth, phone and gender, asked once when you join — and recruiters and admins have a profile page for the first time.",
    details: [
      "Joining asks for a name, an address and a password. The rest is one short step afterwards, which is also the first place a Google sign-up is asked for a phone number at all.",
      "Cairn is for candidates 18 or over. Internships for younger candidates are coming.",
      "Gender is optional, includes a way to decline, and is never shown to a recruiter.",
      "Recruiters and admins can now read and edit their own account. Previously neither had a profile page at any address.",
      "A recruiter's designation — the byline shown on every role they post — can finally be edited. Until now nothing in the product could set it.",
      "A recruiter waiting on approval can read why from their own profile, instead of inferring it from a workspace that refuses to save.",
      "Every form that asks for something required now says so to a screen reader, not only to the eye.",
    ],
  },
  {
    id: "live-console-and-admin-setup",
    date: "2026-08-26",
    kind: "Improvement",
    title: "The console and workspace keep themselves current, and a new admin can finish signing up",
    summary:
      "Moderation and hiring screens now update on their own instead of waiting for a reload, a recruiter waiting on approval sees it clear the moment it happens, and an invited admin finally has somewhere to set their password.",
    details: [
      "The admin dashboard, the approval queue, and a recruiter's own jobs and applicant lists all refresh in the background, each at a rate matched to how fast that particular figure can change.",
      "A recruiter left on the awaiting-approval screen no longer has to reload to discover they have been approved — the screen clears itself once it is.",
      "Screens stop asking for updates while their tab is in the background, so a window left open overnight costs nothing.",
      "An admin invited by another admin now receives a link to a password setup screen alongside their code. Previously the email named a screen that did not exist, and the code could only be redeemed by knowing an unlisted address.",
      "That setup screen is written for someone who has never had a password here, rather than reusing the wording of a password reset.",
      "The setup link carries no code of its own. It opens the form; the code is still typed, so a forwarded or scanned email cannot sign anyone in.",
    ],
  },
  {
    id: "admin-console-dashboard",
    date: "2026-08-25",
    kind: "Improvement",
    title: "The admin console leads with the work that is waiting",
    summary:
      "The dashboard now opens with what needs a decision, then shows how the marketplace is actually doing — posting activity over eight weeks, where candidates sit in the pipeline, and what the open catalogue is made of.",
    details: [
      "Anything awaiting a decision sits at the top and links straight to the screen that resolves it, and says so plainly when there is nothing waiting.",
      "New charts cover postings per day, applications by stage, and how open roles break down by department, employment type and remote share.",
      "A recent-activity feed shows the newest registrations, postings and applications across every portal.",
      "Where a figure cannot honestly be measured the console declines to give one instead of printing a zero.",
      "Every chart's numbers are also readable as text or a table, so nothing is reachable only by hovering.",
    ],
  },
  {
    id: "portal-consistent-auth-screens",
    date: "2026-08-25",
    kind: "Fix",
    title: "Verification and recovery screens now match the portal you came from",
    summary:
      "The email-verification, password-reset and sign-in-recovery screens carry their own portal's colour instead of the job-seeker one, and an empty field's example text no longer reads as something you typed.",
    details: [
      "An employer verifying their email or recovering a password now sees the hiring portal's colour throughout, and the admin console its own — previously every one of these screens borrowed the job-seeker palette.",
      "Placeholder text sits a step back from real input, so an empty field is distinguishable from a filled one at a glance.",
      "Text placeholders on the longer workspace forms were unstyled and inherited the browser's own grey; they now match every other field.",
    ],
  },
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

