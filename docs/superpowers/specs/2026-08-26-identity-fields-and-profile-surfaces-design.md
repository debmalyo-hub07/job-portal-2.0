# Identity Fields and Profile Surfaces — Project A

**Status:** Implemented 2026-08-26. Design agreed with the user 2026-08-26.

This is the first of four projects decomposed from a single request on
2026-08-26. The others are deliberately out of scope here and are named in
**Non-goals** so a reader knows they were considered rather than missed:

- **B — email identity.** Cross-portal email uniqueness and OTP-verified email
  change. One spec, because the uniqueness rule *is* the "is this address free?"
  check the email change consults; splitting them writes that check twice.
- **C — under-18 internships.** Guardian consent, minor status derived from DOB,
  internship-only applications.
- **D — oversight and review queues.** A recruiter's cross-job application queue;
  admin oversight of candidates and recruiters; all-recruiter monitoring with
  suspend and reinstate; per-candidate status history.

Order is A, B, C, D.

## Problem

Three problems, one root cause: an account is a credential, not a person.

1. **No account holds a date of birth or a gender.** `authFields` carries
   `phone`, and nothing else about the human. Age eligibility cannot be
   expressed, so C has nothing to build on.
2. **`phone` is collected in a place half the users never visit.** It sits on
   `registerBodySchema` and the signup form. A Google registration never touches
   that form, so a Google account has no phone and no prompt to add one.
3. **Two of the three portals have no profile surface at all.** `/profile` is
   `ProtectedRoute portal="seeker"` and the Navbar reveals "View profile" only
   for a seeker session. A recruiter and an admin cannot see or edit their own
   account, even though `GET /user/profile` already answers for a recruiter.

Two consequences worth naming, because they are live bugs rather than gaps:

- **`recruiter.designation` has no writer anywhere.** It is rendered publicly as
  the poster's byline on every job detail page, it is projected at all five
  `created_by` populate sites, and no schema in the repository can set it. The
  only row that ever had one got it directly from `seed-demo-catalog`. This is
  the same class as the `experienceYears` / `location` bug already documented in
  `user.controller.ts`.
- **One field, two validations.** `registerBodySchema.phone` requires E.164;
  `profileUpdateBodySchema.phoneNumber` accepts any string up to 20 characters.
  The profile can store a number registration would reject, and the field is
  named differently on each side.

## Decisions (locked with the user)

1. **A hard gate**, modelled on `requireVerified`: an authenticated account with
   no DOB is refused, and the client redirects it to a completion step. Not
   per-action checks, not a dismissible prompt. "Required" is only true if
   something enforces it, and one gate beats a check at every call site.
2. **DOB and gender live in `authFields`**, so all three roles can hold and edit
   them — but **the gate fires for seeker and recruiter only. Admin is
   ungated.** Nothing in the platform reads an admin's DOB, and the one account
   that can unblock every other account should not sit behind a new middleware.
3. **Signup drops to name / email / password.** The completion step collects DOB
   (required), phone (optional, E.164) and gender (optional). Phone moves off the
   signup form because a Google registration never saw it, so the completion step
   is the first place both registration paths meet.
4. **18 and over**, refused with copy that says under-18 internships are coming
   rather than a flat rejection. The reasoning that decided it: admitting minors
   now without a consent mechanism creates a *retroactive* consent obligation
   against rows already in the database. Starting at 18+ never builds that
   backlog, and lowering the floor later is a one-line change plus project C.
5. **The recruiter profile is identity + designation + approval status.** The
   approval panel is where a pending recruiter finally learns why it is blocked:
   `toSessionUser` carries `status` specifically so the client "has a session it
   can explain", and until now nothing explained it.
6. **Enforcement is two layers**, backend middleware plus a frontend guard. A
   frontend-only redirect leaves `curl` able to apply for a job with no DOB, so
   nothing downstream could assume the field exists.
7. **Neither DOB nor gender is clearable.** Blanking a DOB re-gates the account —
   a self-inflicted lockout with no legitimate motive — and
   `"prefer-not-to-say"` already *is* the decline answer for gender.
8. **A is identity-only.** Review queues are D.

## Facts verified against live data, 2026-08-26

Recorded because two of them changed the design.

- **Zero cross-portal email collisions** in `jobportal` and `jobportal_dev`.
  Relevant to B, not A, but it was checked in the same pass.
- Prod holds **1 seeker, 0 recruiters, 1 admin**, 27 companies, 198 jobs. Dev
  holds 1 seeker, 2 recruiters, 1 admin.
- **The catalogue owner has been deleted from prod by hand.**
  `seed-demo-catalog` creates `catalog@demo.invalid` and never deletes the owner,
  yet prod holds zero recruiters — so all 198 prod jobs are orphaned, with
  `created_by` pointing at a row that is gone. Not the sweeper's doing: the seed
  sets `emailVerifiedAt`, and the sweeper only takes unverified rows. This is why
  every recruiter surface looks empty in prod and why the byline renders nothing.
  Out of scope; `npm run seed:catalog` would restore it.
- Prod jobs by type: Full-time 192, **Internship 3**, Part-time 2, Contract 1.
  The under-18 market is not being served today whatever C decides.
- The admin row has `phone: null`, `avatarUrl: null`, and no DOB or gender.
- **Mongoose 8.24.2 accepts `null` against a String `enum` that does not list
  it**, verified with a probe. So `gender` needs no `null` entry in its enum.

## Data model

`authFields` gains two fields, and neither is `required` at the schema level:

```ts
dob:    { type: Date,   default: null },
gender: { type: String, enum: [...GENDERS], default: null },
```

`seed:admin` and `seed:catalog` both create accounts with no DOB, and a
schema-level requirement breaks both on their next run. The requirement belongs
in the gate, which is the only layer that can make it role-specific.

**DOB is a `Date` normalised to UTC midnight.** The trap:
`new Date("2000-01-15")` is UTC midnight, and rendering it through a
local-timezone formatter shifts it a day in any negative-offset zone. So
normalise on write and never format without `timeZone: "UTC"`. A `"YYYY-MM-DD"`
string would be timezone-proof but gives up the native range query project C
needs for "who is under 18"; `Date` plus formatting discipline is the better
trade.

**Gender is a slug enum with a display map:**

```ts
export const GENDERS = ["female", "male", "non-binary", "prefer-not-to-say"] as const;
```

Lowercase slugs rather than title-case, and the repository already argued this:
the note on `JOB_TYPES` calls slugs "the better data shape" and says title-case
survived only because existing rows agreed on it. Gender has no existing rows, so
there is nothing to migrate around, and `WORK_MODES` is already slugs.

`"prefer-not-to-say"` is a **stored value distinct from `null`**. Null means
never asked — a legacy row, or an admin who has not filled the form. The slug
means asked and declined. Collapsing them discards the difference, and because
neither field is clearable (decision 7), null stays stable as "never asked".

## Shared schemas

| Schema | Change |
| --- | --- |
| `phoneSchema` | new — one E.164 definition, replacing two divergent ones |
| `dobSchema` | new — `YYYY-MM-DD`, refined: parses, not future, age 18–100 |
| `genderSchema` | new — `z.enum(GENDERS)` |
| `completeProfileBodySchema` | new — `{ dob, phone?, gender? }`, strict |
| `registerBodySchema` | **drops `phone`** |
| `profileUpdateBodySchema` | `phoneNumber` to `phone`; gains `dob`, `gender`, `designation` |
| `SessionUser` | gains `profileComplete: boolean`, derived and never stored |
| `ProfileView` | gains `dob`, `gender`; new `admin` branch |

Both new account fields are plain `.optional()` — absent means "leave alone" —
rather than following the `clearableInt` pattern, whose `""`-means-clear
behaviour A deliberately does not want (decision 7).

**Dropping `phone` from `registerBodySchema` is a breaking change**, and that
schema is `.strict()`, so a browser holding a stale bundle that still posts
`phone` receives a 400 during the deploy window. That window is one production
seeker wide, and the alternative is one field living in two schemas — the drift
this repository consistently refuses. Recorded as a choice, not an accident.

**`designation` joins `profileUpdateBodySchema`, which fixes the live bug above.**
It is gated to the recruiter branch of `updateProfile`, matching how the seeker
fields already are.

**Public exposure needs no change and gets a test anyway.**
`POSTER_FIELDS = "fullName designation email phone"` is a positive allowlist
applied at all five populate sites, so `dob` and `gender` cannot leak into the
public byline. The protection is a bare string literal, so a test pins it.

## The gate

**Completeness is derived, never stored.** A stored boolean drifts the moment
anything writes DOB by another path.

```ts
export function isProfileComplete(portal: Portal, account: { dob: Date | null }): boolean {
  // Admin is ungated by decision: nothing reads an admin's DOB, and the one
  // account that can unblock every other must not sit behind a new gate.
  if (portal === "admin") return true;
  return account.dob !== null;
}
```

Lives in `account.service.ts`, which owns account shape. Not in
`packages/shared`: the frontend receives the answer on `SessionUser` and must not
recompute it, or there are two sources of truth for one rule.

**The flag rides on `req.auth`, so the gate costs no query.** `authenticate` and
`authenticateAny` both already fetch the account, so both set
`req.auth.profileComplete`. `requireProfileComplete` reads it and refuses with
`403 PROFILE_INCOMPLETE`.

This follows `requireVerified`, which reads `req.auth.emailVerified` — not
`requireApproved`, which re-reads the account with a second `findAccountById`
because `status` never made it onto `req.auth`. Same information, one fewer round
trip per gated request.

**Where it mounts, and pointedly where it does not.** `requireVerified`'s own
comment states the rule: the gate must never block the route that clears it.

| Gated | Not gated |
| --- | --- |
| `POST /application/apply/:id` | `POST /user/profile/complete` — the fix itself |
| recruiter job create / update / close / delete | `GET /user/profile`, `POST /user/profile/update` |
| recruiter company create / update | `/auth/me`, refresh, logout, all public routes |

`/user/profile/update` stays open deliberately: it also writes `dob`, so it is a
second way out of the gate. Browsing `/jobs` requires no DOB.

**`POST /user/profile/complete` is a dedicated endpoint**, not a reuse of
`/profile/update`. Every field on `profileUpdateBodySchema` is optional, so the
completion form could post `{}`, receive a 200, and land back on the gate — a
loop with no error to render. The completion endpoint makes `dob` required at the
schema, so a missing one is a 400 with a field error the form can show. It takes
the same `authenticateAny()` as its neighbour, covering seeker and recruiter and
excluding admin, which does not need it.

**The frontend guard follows `RequireApproved`** — a gate wrapping a subtree,
presentation only, with the API doing the actual refusing.
`RequireProfileComplete` redirects rather than rendering an explainer, because
unlike approval this is something the user can fix immediately.

It composes **inside** `ProtectedRoute` rather than merging into it:
`ProtectedRoute` answers "is there a session", this answers "is it usable", and
the completion page needs the first without the second.

**Two mounted paths, not one portal-neutral path.** `/complete-profile` for
seekers, `/hire/complete-profile` for recruiters. A browser can hold a seeker and
a recruiter session simultaneously — the redux slice is keyed per portal — so one
shared path cannot tell which it is completing, and `ProtectedRoute`'s `portal`
is a route literal by design. The mapping goes in `portalHome.ts` as
`completePathFor(portal)` beside `homePathFor`, because five inline copies of
that mapping is how the admin redirect bug hid.

**One helper for every post-authentication landing:**

```ts
export function landingAfterAuth(user: SessionUser): string {
  return user.profileComplete ? homePathFor(user.portal) : completePathFor(user.portal);
}
```

`completePathFor` is typed over the two gated portals only, not `Portal`, so
passing `"admin"` is a compile error rather than a path with no route behind it.
`landingAfterAuth` consults it solely in the incomplete branch, which an admin
never enters because `isProfileComplete` returns true for that portal
unconditionally.

Without this the step is not first. `AuthComplete` sends a Google registration to
`homePathFor(portal)`, and for a seeker that is `/jobs` — a **public** route
outside every guard — so a Google seeker would sail past the gate and only meet it
on their first application. Login has the same shape. Both call
`landingAfterAuth`.

## Surfaces

Two shared units, three pages.

- **`IdentityFieldset`** — the DOB, phone and gender inputs with their validation
  copy. Used by the completion step *and* all three profile edit forms, so
  "18 or over" and the E.164 hint exist in exactly one place.
- **`IdentityCard`** — the read view: avatar, name, email, phone, DOB, gender.

There is **one** edit dialog, not three. `UpdateProfileDialog` is already 321
lines and seeker-shaped, so rather than branching it three ways it composes
`IdentityFieldset` unconditionally plus an extracted `SeekerFieldset` for the
seeker portal and a single designation field for the recruiter one. The admin
branch adds nothing, so it renders the identity fieldset alone. Extracting the
seeker block is what keeps the file from growing as it gains two more portals.

| Route | Shell | Contents |
| --- | --- | --- |
| `/profile` | existing | `IdentityCard` + resume, skills, fit, applied jobs |
| `/hire/profile` | `HireShell` | `IdentityCard` + designation + approval status |
| `/admin/profile` | `AdminShell` | `IdentityCard` |
| `/complete-profile` | Navbar + `PageShell` | `IdentityFieldset` (seeker) |
| `/hire/complete-profile` | Navbar + `PageShell` | `IdentityFieldset` (recruiter) |

**Backend: one controller pair, two mounts.** `getProfile` and `updateProfile`
already read `req.auth.portal`, and that value is correct under either
middleware:

- `/user/profile[/update]` — `authenticateAny()`, seeker and recruiter, unchanged
- `/admin/profile[/update]` — `authenticate("admin")`, **the same two functions**

ADR-0006's boundary holds with no duplicated logic: `authenticateAny` is never
widened, which that ADR requires because an admin cookie "must never silently
satisfy a route that meant 'some signed-in user'". The admin mount omits
`resumeUpload`, so there is no multipart path into an admin row. `toProfileView`
gains an `admin` branch that is the identity block alone.

**Entry points: the account popover only, no sidebar link.** The Navbar gates
"View profile" on `portal === "seeker"`; it becomes all three via
`profilePathFor(portal)` in `portalHome.ts`. Nothing is added to `navLinksFor`,
because the seeker case there already documents why: the popover "carries 'View
profile'... so a primary link duplicated the only path to the page". That
reasoning transfers unchanged to the two workbenches.

**The completion step keeps the Navbar**, and this is what stops it being a trap.
`RequireApproved`'s comment: "The Navbar stays so a pending recruiter can still
reach the account menu and sign out. Without it this is a page with no way off
it." Identical risk, so Navbar + `PageShell` + a centred form — not `AuthLayout`,
which is for pre-session screens and carries a Back link to a portal prefix.

Under-18 refusal copy: **"You need to be 18 or over to join Cairn. We're working
on internships for younger candidates."** A 400 from `dobSchema`, rendered as a
field error rather than a dead end. *(Superseded by Project C on 2026-08-27:
the join floor is now 16 with guardian consent, and the message reads
"You need to be 16 or over to join Cairn." — see the under-18 spec in this
directory.)*

## Error handling

Gate errors are handled at the call site, not in a global interceptor —
`Login.tsx` already catches `EMAIL_NOT_VERIFIED` and navigates, and a second
redirect authority in the response interceptor would fight the route guard.

`403 PROFILE_INCOMPLETE` is unreachable in normal flow, because the guard
redirects first; it fires only for a stale bundle. The Apply call site catches
the code and navigates to `completePathFor("seeker")`.

Apply is the only call site that needs this, and not for symmetry: every
recruiter write lives inside the workspace subtree, wholly behind the guard,
whereas **`/description/:id` is a public route**. A signed-in seeker with no DOB
can browse a job detail page and press Apply without ever passing through
`RequireProfileComplete`, so that button is the one place a 403 is reachable in
normal use rather than only from a stale bundle. Under-18 and malformed
dates are 400s rendered as field errors.

## Enforcement

Three suites, because `packages/shared` has its own that neither the api nor the
web test command covers.

**shared.** `dobSchema` accepts a valid date and rejects the future, malformed
input and age over 100. **The 18th-birthday boundary is tested in both
directions** — exactly 18 today passes, one day short fails — under
`vi.setSystemTime`, because a real clock makes that assertion flaky for one day a
year. `genderSchema` accepts all four slugs and rejects anything else.
`completeProfileBodySchema` requires `dob` and is strict.
`profileUpdateBodySchema` accepts `phone`, `dob`, `gender` and `designation`, and
**rejects `""` for dob and gender**, pinning decision 7. `registerBodySchema` now
rejects `phone`.

**backend.** `isProfileComplete` returns true for admin unconditionally. Both
`authenticate` and `authenticateAny` set `req.auth.profileComplete`.
`requireProfileComplete` 403s an incomplete session and 401s with no auth.
Apply-to-job and recruiter job and company writes are refused while incomplete
and succeed after completion. **The ungated routes stay reachable while
incomplete** — `/user/profile`, `/user/profile/complete`, `/auth/me` — which is
the `requireVerified` trap and gets explicit tests rather than an assumption.
`/admin/profile` answers an admin token and **fails signature verification with
a seeker token**, pinning the ADR-0006 property. `POSTER_FIELDS` excludes the new
fields, asserted at source level and by checking a public job response carries no
`dob` key. Both seed scripts still run.

**frontend.** `RequireProfileComplete` sends an incomplete session to the correct
path per portal. The completion page renders, submits, and lands via
`landingAfterAuth`. The Navbar popover offers "View profile" on all three
portals. Each profile page renders its own blocks. **The completion page renders
the Navbar**, so sign-out is reachable. An incomplete seeker can still browse
`/jobs`.

Four traps from prior sessions that the implementation plan must carry:

1. **Rebuild `packages/shared` before running frontend tests.** The web suite
   reads its `dist`, so a source-only schema change is invisible and a mutation
   check fakes a pass.
2. **Assert the destination page rendered, never the URL.** `useAuthBootstrap`
   sits above the router, so redirect chains end elsewhere in jsdom than in a
   real browser, and `createMemoryRouter` cannot be used at all.
3. **Pass `path` explicitly to `renderRoute`** for anything carrying a query
   string, or the route pattern contains the query and matches nothing.
4. **Frontend tests are not typechecked** — `tsconfig` includes only `src`, so a
   broken import in a test passes `npm run typecheck` in silence.

Closing verification is `npm run ci` plus `npm run audit:prod` (a separate CI
job), then a real-browser render, because a green jsdom suite is not evidence the
application boots.

## Migration surface

**None.** `dob` defaults to null and completeness is derived, so the production
seeker meets the gate on next sign-in and fills one field, and the admin is
ungated. No script, no backfill. Neither seed breaks, because nothing is
`required` at the schema level. This is the dividend from deriving completeness
rather than storing a flag.

## Documentation

Per the repository's one-canonical-document rule:

- `ARCHITECTURE.md` — the gate, the derived flag, the two-mount controller pair.
- `README.md` — four new routes in both tables (`/profile` already exists).
- `SECURITY.md` — gender never reaches a recruiter; DOB never enters
  `POSTER_FIELDS`.
- `frontend/src/data/updates.ts` — a release-note entry in the shipping commit.
- `admin.model.ts` — a comment amendment. Its "an admin is an authority over the
  domain, not a participant in it" reasoning stays true, but "admins carry no
  profile fields of their own" now needs to mention the profile surface.

**No ADR.** A reverses nothing documented. The ADR-0006 amendment belongs to B.

## Non-goals

- Cross-portal email uniqueness and OTP email change — project B.
- Under-18 registration, guardian consent, internship-only applications — C.
- Recruiter and admin review queues, per-candidate application history,
  all-recruiter monitoring with suspend and reinstate — D. Note that D must
  decide, on purpose, whether admins may see applicant identity: the activity
  feed currently says "The role applied to, never the applicant."
- Restoring the deleted `catalog@demo.invalid` owner and un-orphaning the 198
  production jobs. A one-command fix, unrelated to identity.
- Exposing gender to recruiters, or to any analytics or console surface. It is
  visible to the account owner alone.
- Avatar upload. `avatarUrl` exists and stays as it is.

## Success criteria

1. A new seeker or recruiter cannot reach a consequential action without a DOB,
   through the UI or with `curl`.
2. A Google registration meets the completion step before the home page.
3. DOB under 18 is refused with the internships message.
4. All three portals can view and edit their own profile, with email read-only.
5. A pending recruiter can read why it is blocked from its own profile page.
6. `recruiter.designation` has a writer, and the public byline can be set.
7. `phone` has one name and one validation across the codebase.
8. `dob` and `gender` appear in no public response.
9. A signed-in account with no DOB can still browse `/jobs` and sign out.
10. `npm run ci` and `npm run audit:prod` are green, and the deployed app renders
    the completion step in a real browser.


---

## Amendment, 2026-08-26 — what implementation found

Recorded rather than folded into the body above, so the difference between what was
designed and what was true stays visible.

**1. There were four post-authentication landings, not two.** The design named
`AuthComplete` and `Login`. Two more existed:

- `VerifyEmail` — the **primary** path for a password registration, which by
  definition has no date of birth. It called `homePathFor`.
- `GuestRoute` — which redirects a signed-in session off `/login` and `/signup`
  using `homePathFor`. This one is worse than a missed call site: its redirect
  fires the moment `setUser` lands, while the login screen it guards is still
  mounted, so it **races and beats** the navigation `Login` had just issued. With
  the first two fixed and these two missed, every account still landed on the
  board and the completion step was reachable only by typing its URL.

Neither was visible to the test suite, which passed in full. A real-browser
walkthrough found it in one run. `loginDestination` was added alongside
`landingAfterAuth` to hold the `from`-versus-identity precedence in one testable
place, and `completeProfile.test.tsx` now asserts the destination for all four.

**2. `Date` does not reject an impossible calendar day.** The plan asserted that
strict ISO parsing refuses `2000-02-31`. It does not: V8 rolls it forward to
`2000-03-02` and `Date.parse` returns a valid number, so a `Number.isNaN` check
accepts every impossible date anyone can type. `dobSchema` uses a round-trip
(`toISOString().slice(0, 10) === input`) instead.

**3. A schema's own message never reached the user.** `parseBody` throws
`VALIDATION_ERROR` with `message: "Request validation failed."` and the Zod issues
in `details`, and `getApiErrorMessage` read only `message`. So the under-age
copy — the one refusal on this platform that has to explain itself, because it
means "not yet" rather than "no" — displayed as a shrug. `getApiErrorMessage` now
prefers the first issue's message for that code, which fixes every form at once.

**4. Requiredness was visual-only.** `FormField` renders a `*` marked
`aria-hidden` — correct, a screen reader reading "asterisk" is noise — but nothing
carried the fact programmatically. It now sets `aria-required` on the control.

**5. Two coverage gaps the schema-derived guard exposed.** `profile.test.tsx`
derives its field list from `profileUpdateBodySchema.shape`, so the three new
fields went red immediately. Rather than allowlist them out — the baseline
antipattern the colour gate already got burned by — the seeker dialog gained real
controls and the guard became portal-aware, with `designation` covered by a
matching guard on the recruiter page. That second guard then caught a gap nobody
had noticed: a recruiter could not edit their own **full name**, the other half of
the public byline.

**6. `/hire/profile` is mounted outside `RequireApproved`.** The plan said to use
the `workspace(...)` helper. That helper adds the approval gate, which replaces the
whole workspace with a notice — so the one page that explains a pending account
would have been hidden from the only person who needs it. It mirrors the API
instead, where the profile pair carries no approval gate.
