# Phase 2B-3 — Recruiter Workspace (Design)

Date: 2026-08-10. Status: approved by user (rebuild the recruiter workspace on
the Ink & Signal system, converge its data layer on the console's react-query
pattern, and fix the field-level bugs that reading it turned up; keyword search
goes server-side for jobs only; `jobType` becomes an enum matching the seeker
facet's existing title-case values).

## Goal

`frontend/src/components/admin/*` is the last surface still on the inherited
structure. Every other portal has been rebuilt — the auth surfaces and landing
page in 2B-1, the seeker pages in 2B-2, the admin console in 3B — and the
recruiter workspace was deferred each time. It has no `PageShell`, no
`PageHeader`, hand-tuned spacing on every page, and it owns both surviving
`react-hooks/exhaustive-deps` warnings.

Reading it closely turned up more than styling. The workspace is where a
recruiter creates the data the entire seeker surface consumes, and three of its
defects are silent — they look like working features:

- **A recruiter cannot post a remote job.** `remote` is on
  `jobCreateBodySchema`, on the Mongo model, and drives the matching pipeline's
  `remoteFit` factor. No form has ever rendered a control for it, so every row
  in the database carries the schema default `false` and the seeker board's
  Remote facet matches nothing, always.
- **A recruiter can post a job type the seeker board can never filter for.**
  `jobType` is validated as `z.string().min(2).max(40)` and rendered as a free-
  text input. `FilterCard` filters by exact equality against a hardcoded
  `["Full-time", "Contract", "Internship", "Part-time"]`. "Full Time",
  "fulltime" and "FT" are all accepted, stored, displayed on the job card, and
  unfilterable.
- **Deciding on an applicant does not update the screen.** `ApplicantsTable`
  POSTs the status, toasts success, and never refetches. The row shows the old
  status until a manual reload.

And one that is not silent at all: the accept/reject controls are
`<div onClick>`. No role, no `tabIndex`, no focus ring. They work for a mouse
and do not exist for a keyboard.

Exit criteria:

- No file under `frontend/src/components/` named for a portal that does not own
  it. The recruiter workspace is `components/workspace/`, the admin console
  stays `components/console/`, and the shared route guards are
  `components/routing/`.
- Every workspace page renders through `HireShell` → `PageShell` → `PageHeader`,
  with exactly one `<h1>` per route and no hand-tuned spacing.
- Every workspace list paginates, and its keyword and page live in the URL.
- No workspace screen reads server data from redux. `companySlice` and
  `applicationSlice` no longer exist.
- A recruiter can post a remote job, and can only post a `jobType` the seeker
  board can filter for.
- Every interactive control is reachable by keyboard.
- `npm run ci` passes. `npm run lint:colour` stays at zero. The two
  `exhaustive-deps` warnings are gone — both are the
  `dispatch(setSearchXByText(input))` effects in `AdminJobs.tsx:18` and
  `Companies.tsx:18`, which the move to URL-as-state deletes outright — so lint
  is warning-free.

Scope boundary: the application status vocabulary stays two-outcome
(`accepted`/`rejected`). Widening it to the seven values already defined in
`APPLICATION_STATUSES` is a product decision with a schema, service and data
migration attached, and belongs in its own phase.

## Why the workspace is last, and what that cost

2B-1 rebuilt auth, 2B-2 the seeker pages, 3B the admin console. Each phase left
the workspace alone because it was not the surface under discussion. The result
is that the workspace has been the odd one out for three phases, and the
patterns the rest of the app converged on — URL-as-state, react-query for server
data, layout primitives, one data pattern per concern — were each established
somewhere else and never applied here.

That is the actual defect this phase closes. The styling is the visible part;
the divergence is the expensive part. `searchJobByText` and
`searchCompanyByText` are the last two survivors of the pattern 2B-2 deleted
`searchedQuery` for, and they survived only because nothing had reason to touch
these files.

## Shape

Six pages move from `components/admin/` to `components/workspace/`. The rename
is load-bearing rather than cosmetic: `components/admin/*` holding the
**recruiter** workspace while `components/console/*` holds the **admin** console
is the same confusion that let the recruiter workspace live at `/admin/*` until
3A moved it. After this phase the directory name says which portal owns the
file.

`ProtectedRoute.tsx` and `RequireApproved.tsx` are route guards, not recruiter
pages, and `ProtectedRoute` already serves the console (`adminConsole()` in
`appRoutes.tsx` wraps it). Both move to `components/routing/`, so the console
never imports from a directory named for the other portal.

| Now | Becomes |
|---|---|
| `admin/Companies.tsx` + `admin/CompaniesTable.tsx` | `workspace/WorkspaceCompanies.tsx` |
| `admin/CompanyCreate.tsx` | `workspace/CompanyCreate.tsx` |
| `admin/CompanySetup.tsx` | `workspace/CompanyEdit.tsx` |
| `admin/AdminJobs.tsx` + `admin/AdminJobsTable.tsx` | `workspace/WorkspaceJobs.tsx` |
| `admin/PostJob.tsx` | `workspace/JobCreate.tsx` |
| `admin/Applicants.tsx` + `admin/ApplicantsTable.tsx` | `workspace/Applicants.tsx` |
| `admin/ProtectedRoute.tsx` | `routing/ProtectedRoute.tsx` |
| `admin/RequireApproved.tsx` | `routing/RequireApproved.tsx` |

The three `*Table.tsx` files collapse into their pages. They were split to keep
the redux-filtering effect separate from the page; with the filter gone the
split is one indirection serving one caller.

`CompanySetup` becomes `CompanyEdit` because that is what it does — the name
suggested a first-run wizard, and a recruiter arriving at it for an existing
company had no way to tell.

### `HireShell`

New: `workspace/HireShell.tsx`, mirroring `console/AdminShell.tsx` exactly —
`Navbar`, `PageShell density="compact" width="wide" motion="response"`,
`PageHeader`, and a sub-navigation built from `navLinksFor("recruiter")`.

`motion="response"` for the same reason the console has it: this is work, not
marketing, so Tier 3 feedback only — no ambient loops, no scroll narrative.
`density="compact"` likewise. `/hire` itself stays `spacious`, because it is a
marketing page that happens to be recruiter-scoped; density follows the
surface's job, not the portal.

Reading the sub-nav from `navLinksFor("recruiter")` rather than listing routes
again is what keeps the shell's tabs, the desktop navbar and the mobile sheet
from disagreeing about which pages exist.

### Routes do not change

All six paths stay exactly as they are. Only the import specifiers in
`appRoutes.tsx` move. The `workspace()` helper composing `ProtectedRoute` +
`RequireApproved` in the API's order is unchanged, and
`tests/workspaceRoutes.test.tsx` keeps guarding the `/admin/*` literals —
including inside comments — as it does today.

## Data layer

All server reads move to react-query in one new hook file,
`hooks/useRecruiterWorkspace.tsx`, mirroring `hooks/useAdminConsole.tsx`: the
same `keepPreviousData`, the same URL-as-state `useListParams`, and the same
rule that mutations invalidate rather than update optimistically. A moderation
or hiring action that appears to succeed and silently did not is worth an extra
round trip to avoid.

### One backend change: keyword on owned jobs

The workspace's three list endpoints take `paginationQuerySchema` only — there
is no keyword parameter anywhere. Search works today only because both list
pages fetch `limit=50` and filter the result in the browser.

That is survivable while nothing paginates. It stops being survivable the moment
`Pager` is wired: **a client-side filter over a server-paginated list searches
only the rows currently on screen while presenting itself as searching
everything.** Silently wrong, and the same shape as the two-boards bug 2B-2
closed.

So owned jobs gains a keyword, following `listPublicJobs` line for line:

```ts
// packages/shared/src/domain.ts
export const ownedJobsQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});

// backend/src/services/job.service.ts
export async function listOwnedJobs(
  ownerId: string,
  query: OwnedJobsQuery,
): Promise<PaginatedResponse<JobDto>> {
  const filter: Record<string, unknown> = { created_by: ownerId };
  if (query.keyword) {
    const re = new RegExp(escapeRegex(query.keyword), "i");
    filter.$or = [{ title: re }, { description: re }];
  }
  return paginate(filter, query);
}
```

`escapeRegex` is mandatory, not stylistic: the keyword is user input reaching a
`RegExp` constructor. No `mongoose.trusted` wrapper is needed — a `RegExp` has
no `$`-prefixed keys, so `sanitizeFilter` passes it through, exactly as it does
for the public board.

The ownership filter stays `created_by: ownerId`, so a keyword can only ever
narrow a set the caller already owns.

**Companies and applicants are deliberately not given one.** `/company/get`
returns every owned company as a plain unpaginated array, so filtering it in the
browser is honest — every row is present. The keyword still lives in the URL, so
both lists behave identically from the user's side. Applicants gets `Pager`
only; applicant search is a new capability rather than a port of an existing
one, and it can be added when someone asks for it.

### Mutations

- `useJobCreate` → invalidates the owned-jobs list.
- `useCompanyCreate` / `useCompanyUpdate` → invalidate the companies list and
  the single-company query.
- `useApplicantDecision` → invalidates the applicants query for that job. **This
  is what fixes the stale-row bug**; it falls out of using the pattern rather
  than being a separate fix.

### The slices empty out

Every consumer was traced before proposing a deletion:

- **`jobSlice`** — `allAdminJobs`, `searchJobByText` and both setters have no
  readers left once `WorkspaceJobs` uses the hook. Deleted. The slice survives
  on `allJobs`, `singleJob` and `allAppliedJobs`, which are seeker surface.
- **`companySlice`** — `companies` (read only by the job form's company picker),
  `singleCompany` and `searchCompanyByText` all go. The slice is then empty and
  is **deleted**.
- **`applicationSlice`** — holds one field, `applicants`, read only by the two
  applicant components. **Deleted.**

Three hooks go with them: `useGetAllAdminJobs`, `useGetAllCompanies`,
`useGetCompanyById`.

The real result is that **two of the four slices stop existing.** After 2B-3,
redux holds the session and the seeker's cached lists, and every recruiter and
admin screen is react-query. The `searchJobByText`/`searchCompanyByText` pair
were the last of the pattern 2B-2 deleted `searchedQuery` for.

### Persistence version bump

`store.ts` persists the whole root, so `company` and `application` subtrees
exist in the `localStorage` of every browser that has used the app. Removing the
reducers leaves orphaned keys that `combineReducers` warns about in development.

`persistConfig.version` goes 2 → 3 to discard the subtree, with no migration
function — the same reasoning as the 1 → 2 bump recorded in the comment there:
there is nothing worth migrating, because all of it is server data that
refetches.

**This costs nothing at the session layer, because of the nested config.** `auth`
is wrapped in its own `persistReducer` at key `auth` (store.ts:60), which is a
separate `localStorage` entry from the root's `persist:root`. Bumping the root
version discards `persist:root` — `job`, `company`, `application` — while
`persist:auth` still matches its own unchanged version and rehydrates normally.
So the cached `user` survives and there is no signed-out flicker. The nested
reducer was added to keep `bootstrapped`/`loading` out of storage; that it also
decouples the session from root-version bumps is a second dividend.

`makeStore()` in `tests/helpers/renderRoute.tsx` drops the two reducers to
match, or the suite builds a store shaped unlike the app's.

## Forms

Both forms move onto `FormField`, which clones `aria-describedby` and
`aria-invalid` onto the control it wraps. The current pages render hints as
loose `<p>` elements associated with nothing — `PostJob`'s "Please register a
company to post a job" is one of them, and a screen reader never connects it to
the submit button it explains.

### `JobCreate`

- **`jobType` becomes a `<Select>` over `JOB_TYPES`.** `packages/shared`
  already exports `JOB_TYPES` and `jobTypeSchema`, and grep confirms **nothing
  imports either** — they are dead exports, while the seeker facet carries its
  own hardcoded literal. `JOB_TYPES` is corrected to the four title-case values
  `FilterCard` already filters on (`Full-time`, `Part-time`, `Internship`,
  `Contract`), and both the form and `FilterCard` import it. `jobCreateBodySchema`
  takes `z.enum(JOB_TYPES)`, so a value the board cannot filter for is a 400
  rather than an unfilterable row.

  Title-case rather than the lowercase the enum currently declares, because the
  facet's values are what existing data and the existing filter agree on.
  Lowercase is cleaner as data, but adopting it requires rewriting every stored
  `jobType` — guesswork over free text — and that migration deserves its own
  phase. Recorded as a follow-up below.

- **`remote` gets a checkbox.** The field exists everywhere except the form.
- `experience` becomes a number input, matching
  `z.coerce.number().int().min(0).max(50)`.
- `description` and `requirements` become `<textarea>`. `requirements` is
  comma-split server-side, and the field says so in a hint.
- The company picker reads react-query and **matches on `id`**, not
  `name.toLowerCase()`. Two companies with the same name currently resolve to
  whichever the array happens to hold first.
- **The zero-company dead end is replaced.** Today a recruiter with no company
  gets a complete form that cannot succeed plus a warning below the submit
  button. It becomes an `EmptyState` with a "Create a company" action —
  CLAUDE.md's "no dead controls" rule, applied to a form rather than a button.

### `CompanyEdit`

`FormField` throughout, `website` typed as a URL input, the logo file input
labelled. The hydrating `useEffect` stays — this is an edit form genuinely
seeded from a fetch, not a redux mirror — but it seeds from the query result
rather than `singleCompany`.

### `CompanyCreate`

One field, so it changes least: `PageHeader`, `FormField`, and the unused
`Navigate` import goes.

### `Applicants`

The accessibility fix. Accept and reject become `DropdownMenu` items — the
primitive 2A shipped and this page never adopted — so they are buttons with
roles, keyboard operation and a focus ring. Status renders as a `Badge` paired
with a lucide icon, never colour alone, matching `AppliedJobTable`.

## Error, empty and loading states

Every list follows the console's three-state shape, because a recruiter's first
session legitimately has nothing in it and an empty table with no explanation
reads as a failure:

- **Loading** — `Skeleton` rows, not a spinner and not a blank screen.
- **Error** — `role="alert"` with the message, in `text-danger`.
- **Empty** — `EmptyState` with an icon, a title and the action that resolves
  it. The empty-because-filtered copy differs from the empty-because-new copy,
  as it does in `AdminCompanies`.

`RequireApproved` already renders the pending state and keeps `Navbar` mounted
so a pending recruiter can still sign out. Unchanged.

## Testing

**API** — `backend/tests/job/ownedJobs.test.ts`:

- keyword narrows the owned set (title match, description match, no match)
- a regex metacharacter in the keyword is a literal, not a pattern — the
  `escapeRegex` assertion, which is the one that fails open if the call is
  dropped
- keyword never widens past ownership: an unrelated recruiter's job matching the
  keyword stays absent
- pagination envelope unchanged (`items`/`total`/`page`/`pages`)
- the authorization matrix per CLAUDE.md: anonymous, seeker, pending recruiter,
  unrelated recruiter, owner

**Web** — `frontend/tests/workspace.test.tsx`:

- all six routes mounted, resolving `data-portal="recruiter"`
- the gate matrix: anonymous, seeker and admin each bounced to their own home
  via `homePathFor`
- a pending recruiter sees the awaiting-approval state on every one of the six,
  not just the entry page
- exactly one `<h1>` per route, matching `seekerBoard.test.tsx`'s assertion
- `navLinksFor("recruiter")` links only to paths the route table mounts

Existing suites that must be updated rather than left passing: `makeStore()` in
`tests/helpers/renderRoute.tsx` drops two reducers. **No test imports from
`components/admin/*`** — `appRoutes.tsx` is the only importer of all eight files
— so the move itself touches exactly one source file's import block.

`workspaceRoutes.test.tsx` needs no change: its literal scan covers all of `src`
and exempts only the route table by path, so relocating files does not affect
it, and `sourceFiles(SRC).length > 50` still holds.

Every new test is mutation-verified — the bug is reintroduced and the specific
test confirmed to fail. A test that cannot fail is indistinguishable from one
that passes.

## What this does not do

- **The application status vocabulary stays two-outcome.** `APPLICATION_STATUSES`
  defines seven values; `applicationStatusBodySchema` accepts two. Widening it
  is a schema, service, DTO and data-migration change, and a product decision
  about what a hiring pipeline should model.
- **`jobType` stays title-case.** Normalising to lowercase slugs with a display
  mapping is the better data shape, but requires a migration over free-text rows
  that is guesswork. Recorded as a follow-up.
- **Applicant search.** `Pager` only, per the scope decision above.
- **The Cloudinary orphan on logo replacement** is untouched and remains a known
  gap.
- **`packages/shared/src/legacy-dto.ts`** stays vestigial; it is unrelated to
  this surface.

## Follow-ups this phase creates

- Normalise `jobType` to lowercase slugs with a display mapping, plus the
  migration over existing rows.
- Applicant keyword search, if it is asked for.
- The status pipeline widening, as its own phase.
