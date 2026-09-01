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
    id: "applicant-alerts-and-funnel",
    date: "2026-09-02",
    kind: "Feature",
    title: "Recruiters hear about new applicants instantly",
    summary:
      "The moment someone applies to one of your roles, you get an email naming them and the role, with a link straight to the applicant list. The list itself now opens with a pipeline strip — where every applicant stands, at a glance.",
    details: [
      "The email arrives whether or not you're watching — applications no longer wait to be discovered.",
      "The pipeline strip counts every stage across all of the role's applicants, not just the page you're on.",
    ],
  },
  {
    id: "approval-automation",
    date: "2026-09-02",
    kind: "Feature",
    title: "Recruiters from known employers can be approved automatically",
    summary:
      "A new platform switch — off by default — lets recruiters whose signup email is at a known employer's own website domain be approved the moment they verify their address. Everyone else is reviewed by a person, exactly as before.",
    details: [
      "The approval queue's rows now carry trust signals — whether the signup used a custom domain and whether it matches a company already on the platform — so human reviews are faster too.",
      "Every automatic approval is recorded and shown in the console's activity feed, with the matched employer named.",
    ],
  },
  {
    id: "feature-flags",
    date: "2026-09-01",
    kind: "Feature",
    title: "The console gains a Flags screen",
    summary:
      "Admins can now flip platform-wide feature switches from the console — each switch says what it does, what its default is, and who last changed it. The first switch is reserved for the upcoming approval automation and ships off.",
    details: [
      "Switches take effect within seconds, without a redeploy, and every change is attributed.",
      "Nothing user-facing changes yet — the first switch is reserved and inert until the automation it guards ships.",
    ],
  },
  {
    id: "admin-new-work-alerts",
    date: "2026-09-01",
    kind: "Feature",
    title: "The console now tells admins when a recruiter is waiting",
    summary:
      "When a new recruiter verifies their email and joins the approval queue, every active admin gets an email — the recruiter's name, how many are waiting, and a link straight to the queue.",
    details: [
      "The email fires only once the recruiter has verified their address — the moment a signup becomes a real person rather than an abandoned form.",
      "If email delivery fails, nothing else is affected: the verification still succeeds and the queue still updates; the alert simply does not arrive.",
    ],
  },
  {
    id: "use-my-location-prod-fix",
    date: "2026-09-01",
    kind: "Fix",
    title: "\"Use my location\" now works on the site",
    summary:
      "The site's own security header was telling browsers to keep location switched off, so every \"Use my location\" tap failed the instant it was clicked. The header now allows location for the site itself.",
    details: [
      "It looked like your browser refusing — but the permission dialog never appeared. The site was blocking the feature before your browser could even ask you.",
      "Nothing else about the flow changed: your precise position is still used for one city lookup and then discarded, and only the city is kept.",
    ],
  },
  {
    id: "console-clock-fits",
    date: "2026-09-01",
    kind: "Fix",
    title: "The console's clock now fits its panel on every screen",
    summary:
      "On wide screens the admin console's clock and calendar were squeezed into their side panel — the calendar's days ran into each other and the time broke onto two lines. The clock is now a flat part of that panel and sizes itself to it, looking the same on a phone and a wide monitor.",
    details: [
      "The time reads 24-hour (20:01:24), so morning and evening are never a guess, and it fits on one line at every width.",
      "The small server timestamp that sat beside \"Invite admin\" in the console header is gone — it moved with every silent background check and read as a stray timer. The clock in the side panel keeps the time.",
    ],
  },
  {
    id: "near-you-ranking",
    date: "2026-09-01",
    kind: "Feature",
    title: "The job board now leads with roles near you",
    summary:
      "Signed-in candidates see a \"Near you\" rail above the board: open roles ranked by how close they are to your area, how well they fit your profile, and how fresh they are.",
    details: [
      "Roles in your own city come first, then your region, then everywhere else — with remote roles ranked alongside your region's.",
      "Distance leads, but it is not the whole story: your existing fit with each role breaks ties, and newer postings surface above older equals.",
      "No stored area yet? The board offers a one-time \"Use my location\" prompt — share once, only the city is kept, dismiss it and it never asks again.",
    ],
  },
  {
    id: "phone-country-codes",
    date: "2026-09-01",
    kind: "Improvement",
    title: "Phone numbers now pick their country for you",
    summary:
      "Entering or changing a phone number, on any portal, offers a country picker preselected for where you are — and checks the number against that country's actual rules instead of just its shape.",
    details: [
      "The country is preselected from the platform's own location signal, so your first keystroke is usually just your number.",
      "Numbers are validated per country — the right length, the right prefix, and mobiles only: landlines are refused, because a verification text is where this is heading.",
      "You can still type or paste a full international number; the picker follows it.",
    ],
  },
  {
    id: "seeker-location",
    date: "2026-09-01",
    kind: "Feature",
    title: "Your profile can now know where you are looking",
    summary:
      "Candidates can set their area once, with the browser's own permission, and the platform keeps only the city — never the precise position.",
    details: [
      "A \"Use my location\" action on your profile asks your browser for permission, resolves your city, and saves it to your profile.",
      "Only the city and country are stored. The precise position your browser shares is used for that one lookup and then discarded.",
      "Job recommendations that use your area are coming next.",
    ],
  },
  {
    id: "console-clock",
    date: "2026-08-31",
    kind: "Improvement",
    title: "The admin console keeps time — and stopped flickering",
    summary:
      "The console's side panel now carries a live ticking clock, the full date and a month calendar, in your own timezone (IST by default). And the page no longer dims itself every time it quietly checks for updates in the background.",
    details: [
      "The console used to fade to half brightness whenever it refreshed its numbers — including the silent checks it runs every half minute — so the page appeared to stutter while you were reading it. It now stays perfectly still unless you press Refresh yourself.",
      "The clock shows the time to the second, the date, and your timezone's offset, and can be switched to any common working timezone. The calendar highlights today and flips through months.",
    ],
  },
  {
    id: "every-role-has-a-recruiter",
    date: "2026-08-31",
    kind: "Improvement",
    title: "Every role now has a hiring team you can reach",
    summary:
      "Each of the marketplace's employers and their open roles is now owned by a real recruiting lead. Every job page names who posted the role, and signed-in candidates can contact them directly.",
    details: [
      "Job pages now show a Posted by card naming the recruiter behind the role and their title. Candidates signed in to the candidate portal also see the poster's contact details there; visitors who are not signed in are invited to sign in instead.",
      "Applying to any role now reaches the recruiter who owns it: applications land in that person's applicant queue and notify them by email.",
      "Every employer profile now carries its website, so the details a candidate wants before applying are on the page.",
    ],
  },
  {
    id: "hire-hero-crop-stable",
    date: "2026-08-31",
    kind: "Fix",
    title: "The employer hero no longer trims its photo when you hover",
    summary:
      "Moving the cursor over the opening photo of the employer landing page zoomed it a touch, which cropped a sliver off the top of the picture — the team's heads. The photo now holds its framing; the cursor's light, the focus reticle and the photo's gentle drift with the pointer all remain.",
    details: [
      "Hovering enlarged the photo by two per cent, and because the employer hero keeps its subject near the top of the frame, that zoom read as the picture losing its upper edge rather than as depth.",
      "The photo now keeps one size whether the cursor is over it or not. Everything else the hover does is unchanged.",
    ],
  },
  {
    id: "hero-pointer-tracking",
    date: "2026-08-31",
    kind: "Fix",
    title: "The landing pages' hover motion keeps up with the cursor",
    summary:
      "The focus reticle and light wash that follow your cursor over the opening photo of the candidate and employer landing pages could stutter behind it. They now track smoothly.",
    details: [
      "The hero was redrawing for every pointer event — several per frame on a precise mouse — and each redraw re-laid-out the layered image under it. The tracking now lands once per frame and moves the reticle without touching layout, so nothing stutters.",
      "The background photo still settles gently behind the cursor as before; only the stutter is gone. Readers who prefer reduced motion keep seeing no reticle at all.",
    ],
  },
  {
    id: "recruiter-decision-refresh",
    date: "2026-08-31",
    kind: "Fix",
    title: "Approving or denying a recruiter now updates the row immediately",
    summary:
      "On the console's recruiter screen, approving or denying a request used to leave the Approve and Deny buttons sitting on the row until the page was reloaded. The row now changes the moment the decision is made.",
    details: [
      "The screen lists every recruiter, and a decision changes a row from pending to active — but the list was not refreshed after the decision, so the row still offered the actions it had just resolved.",
      "Suspend and reinstate were already correct; the fix gives approvals and denials the same immediate behaviour.",
    ],
  },
  {
    id: "email-change-reachable",
    date: "2026-08-31",
    kind: "Fix",
    title: "Change email is reachable on every screen size",
    summary:
      "The \"Change\" action beside your email address could disappear on a wide screen when the address filled the row. The address now shortens instead, and the action stays put.",
    details: [
      "The action sat inline after the address inside the same truncated line, so a long address shortened the row by hiding the button — visible on a phone's one-column card, gone on a desktop's two-column one.",
      "The address now shortens with an ellipsis on its own, and the action sits beside it at every width, on all three portals' account pages.",
    ],
  },
  {
    id: "profile-pages-consistent",
    date: "2026-08-31",
    kind: "Improvement",
    title: "One profile page design across every portal",
    summary:
      "Your account page now looks the same whether you are a candidate, an employer, or an administrator — a plain page with just your details on it.",
    details: [
      "The employer and administrator account pages used to sit inside their workspace navigation, so a strip of unrelated section links appeared above your own details — noticeably so on a phone.",
      "All three portals' account pages now share one layout: your details, the standard navigation bar, and nothing else.",
    ],
  },
  {
    id: "admin-console-mobile",
    date: "2026-08-31",
    kind: "Fix",
    title: "The admin console now fits a phone",
    summary:
      "Opening the console on a mobile browser no longer scrolls sideways behind a stretched navigation strip, and the dashboard's \"as of\" time is visible at every screen size.",
    details: [
      "Below desktop width the console's section navigation is a horizontally scrolling strip. Its labels had no width cap, so the strip pushed the entire page wider than the screen — dragging right-to-left revealed empty margin and every panel overflowed its frame.",
      "The strip now scrolls within itself as designed, and the header's action buttons wrap onto a second line instead of pushing the page sideways.",
      "The dashboard's data timestamp, previously hidden on small screens, is now shown everywhere — a stale figure is hardest to notice on the device most likely to be checking it.",
    ],
  },
  {
    id: "google-start-loading-state",
    date: "2026-08-31",
    kind: "Improvement",
    title: "Continue with Google now shows it is working",
    summary:
      "Choosing Continue with Google keeps you on the page with a clear pending state while the sign-in service wakes up, instead of a blank or foreign loading screen.",
    details: [
      "The sign-in service rests when idle, and waking it can take up to a minute. The Google button used to navigate away immediately, so that wait showed whatever the hosting platform painted — never anything of ours.",
      "The button now collects the sign-in start first, holds its own spinner for the whole wake-up, and only then takes you to Google. If the start cannot be reached, it says so beside the button and lets you try again.",
      "Opening a sign-in page now also nudges the service awake in the background, so most clicks never wait at all.",
    ],
  },
  {
    id: "mobile-session-persistence",
    date: "2026-08-31",
    kind: "Fix",
    title: "Sessions survive switching tabs on mobile",
    summary:
      "Signing in on a phone or tablet and then switching to another tab or app could silently sign you out. Sessions now persist across tab switches and reloads on every mobile browser.",
    details: [
      "The web app and API previously lived on different sites, so phones treated every session cookie as third-party data and could block or partition it when the page reloaded or moved into the background.",
      "API requests now pass through the web app's own origin, making the secure session cookies first-party without exposing them to JavaScript.",
      "Affected all three portals — candidate, employer, and administrator — equally.",
    ],
  },
  {
    id: "google-signin-completes",
    date: "2026-08-29",
    kind: "Fix",
    title: "Continue with Google now finishes signing you in",
    summary:
      "Google sign-in could report “Sign-in failed” on an attempt that had actually succeeded. The session is now handed to the app in a way your browser keeps.",
    details: [
      "Candidate and employer accounts were being signed in correctly, but the browser did not carry the new session back to the app, so the last screen of the flow reported a failure and left you signed out.",
      "The final step now completes the sign-in over the app's own connection — the same one email-and-password sign-in has always used — using a single-use code that expires in a minute.",
      "Nothing about your account changed, and Continue with Google still works alongside your password if you have one.",
    ],
  },
  {
    id: "google-auth-seamless-linking",
    date: "2026-08-28",
    kind: "Improvement",
    title: "Continue with Google now signs in directly to verified password accounts",
    summary:
      "Signing in with Google on an existing verified candidate or employer account now links and opens the account directly without an extra email step.",
    details: [
      "If you registered with an email and password and verified your mailbox via the verification code, using Continue with Google with the same email now connects Google sign-in and logs you straight in.",
      "Your existing password is preserved, allowing sign-in with either password or Google going forward.",
      "Google authentication remains strictly isolated to candidate and employer portals and is not available on the admin portal.",
    ],
  },
  {
    id: "google-address-taken",
    date: "2026-08-28",
    kind: "Fix",
    title: "Signing in with Google now says when an address already has an account",
    summary:
      "Trying Google sign-in with an address that already holds an account used to end on the same unexplained failure as a security check refusing you. It now says the address is taken and where that leaves you.",
    details: [
      "One address holds exactly one account across the candidate, employer and administrator portals — Google cannot create a second, so it is refused.",
      "Until now that refusal was indistinguishable from any other failed Google flow, leaving the address's owner with a dead end.",
      "The message matches what sign-up already answers for the same situation, so nothing new is revealed by saying it here. It also notes the existing account may be on another portal, because for Google sign-in that is the only way this refusal happens — and advises signing in there rather than on the page you are already on.",
    ],
  },
  {
    id: "google-link-flow-tidy",
    date: "2026-08-28",
    kind: "Fix",
    title: "The Google linking flow now stays on its own portal and respects email changes",
    summary:
      "Small corrections to the mailbox-confirmation step that connects Google sign-in to an existing password account.",
    details: [
      "Employers who confirm-link Google now land back on the hiring sign-in page, not the candidate one — the confirmation screen previously fell back to candidate styling and links for every portal.",
      "Changing your account's email now voids any outstanding Google link confirmation mailed to the old address: the link asked the old mailbox for consent, and the change moved that consent to the new one.",
      "A Google sign-in already connected to the account keeps working across an email change — it is tied to the Google identity, not the address.",
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
