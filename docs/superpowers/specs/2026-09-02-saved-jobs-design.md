# Saved jobs — the seeker's shortlist

Date: 2026-09-02
Status: approved design, pre-implementation

## The problem

The roadmap's surviving "Saved jobs" row. A seeker browsing the board today
has exactly one way to hold onto a role: apply to it. Comparing focused
opportunities — the board's own promise — means keeping browser tabs open,
because the considered-but-not-yet-applied role has nowhere to live. A save
is the lightest possible hold: a seeker's own list of roles they mean to come
back to.

## Decisions

**D1 — Saving happens where the role is read.** The save control lives on
the description page's aside, below the Apply/closed/minor block, and only
there. The board's card is one whole-card link — a save control inside it
would be interactive content nested in interactive content, invalid HTML that
needs restructuring — and the board would additionally have to fetch
which-of-these-visible-jobs-is-saved to paint honest hearts. A save is a
considered action; it belongs where the role was actually read.

**D2 — A SavedJob collection, not an array on the seeker.** `{ seeker, job }`
with a unique compound index and `timestamps: true` — the same shape, and the
same reasons, as `Application`'s `{job, applicant}`: dedupe by index rather
than a pre-read that races, pagination at the database, unbounded without a
cap, and a deleted posting leaves `job: null` on the row exactly as the
applied list's deleted-job rows do. An array on the account document would
have none of those properties and a last-write-wins race besides.

**D3 — Save and unsave are idempotent toggles.** `POST /saved/:jobId`
answers 201 on insert and 200 when the save already exists (the duplicate-key
error is caught, not surfaced); `DELETE /saved/:jobId` answers 200 whether or
not anything matched. This is deliberately unlike apply's 409
ALREADY_APPLIED: applying twice is a real conflict, because one application
exists and a second would double-count; saving twice is the same state. A
toggle that errors on a stale button teaches the seeker nothing — the button
says Saved, the click says "already saved", and the honest outcome is "yes,
saved". The one refusal is real: a job id that does not exist answers 404
JOB_NOT_FOUND, because saving what isn't there is not a state question.

**D4 — The list is a first-class route, session-gated only.** `/saved`,
behind `ProtectedRoute portal="seeker"` and nothing else — no
`RequireProfileComplete`. Applying is the consequential action that justifies
the profile gate; saving is a bookmark, and demanding a date of birth to view
one's own shortlist would gate the wrong thing. The page is a table in the
applied-jobs idiom (Role, Location, Salary, Saved, Status, actions) with
per-row Open and Unsave. A "Saved" link joins the seeker's session nav
(Home · Jobs · Saved · Help · Updates); signed-out visitors have nothing to
link to. Pagination follows `useAppliedJobs` exactly: local page state,
`keepPreviousData`, `refetchOnWindowFocus` — the applied marker changes when
the seeker applies from elsewhere, which is the same "changed by another
surface" rationale that hook documents.

**D5 — Dead roles stay in the list and are marked, never silently dropped.**
A posting deleted after saving keeps its row with `job: null`, rendered "No
longer available" — the applied list's stance, that the seeker's record is
theirs and overnight disappearance reads as data loss. A closed role is not
null: the populated `JobDto.status` already carries it, and the row shows a
"Closed" marker with no Apply expectation. Closing is also not mailed — a
marker costs nothing; notification is email infrastructure spent on a maybe.

**D6 — The applied marker is computed server-side, exactly.** Each row of
`GET /saved` carries `applied: boolean`, from one bounded read of this
seeker's applications on the page's job ids. It answers the question the list
exists for — which of these am I still deciding on? — and it is exact at any
list size, where a client-side join against the applied list would inherit
that list's pagination and could mark an applied role as unapplied.

**D7 — The description page's button state has its own per-job read.**
`GET /saved/:jobId` answers `{ saved: boolean }` — cheap, cacheable, exact —
rather than scanning a capped list client-side. The anonymous click redirects
to seeker login with a safe return path, identical to Apply's existing
redirect; the control is offered to everyone the page is offered to (a
closed role can still be saved — a shortlist is the seeker's own, and roles
reopen).

## The contract

- `POST /saved/:jobId` — `authenticate("seeker")`, CSRF. 201 insert, 200
  already-saved, 404 `JOB_NOT_FOUND`, 400 malformed id.
- `DELETE /saved/:jobId` — `authenticate("seeker")`, CSRF. 200 whether or not
  anything matched; 400 on a malformed id.
- `GET /saved` — `authenticate("seeker")`. Paginated, newest save first,
  `SavedJobDto` rows.
- `GET /saved/:jobId` — `authenticate("seeker")`. `{ saved: boolean }`, never
  a 404 for a missing job: a save of a job that does not exist cannot exist,
  so the answer is `false` — a check endpoint has no business erroring on the
  thing it is checking for.

`SavedJobDto` (shared, `domain.ts`): `{ id, jobId, savedAt, job: JobDto | null,
applied: boolean }` — `id` is the save's own id, `savedAt` its timestamp,
`job` null only for a deleted posting, `applied` from the D6 join. `jobId` is
the stored reference, always present: populating a deleted job yields null
and loses the raw id, and it is that id an Unsave targets — a dead row must
still be removable from the list. The applied join keys on the stored ids
for the same reason (an application on a since-deleted job still counts).

## Non-goals

- Saving from board cards — rejected at D1 for the HTML and state reasons.
- Close notifications — a marker, not a mail (D5).
- Saved searches and alerts — a different feature that would need its own
  infrastructure and privacy decision.
- Notes, tags, or ranking on a save.
- Sharing or exporting the list.
- A cap — a collection paginates forever; there is no array to bound.
- Recruiter visibility into saves — a save is the seeker's private signal
  and reaches no recruiter surface.

## Testing

- Backend: the save/unsave/list matrix — anonymous 401 and wrong-portal 401;
  CSRF on writes; re-save idempotent (200, exactly one row); unsave idempotent
  (200 on absent); the list shows only the caller's saves, newest first,
  paginated; a deleted posting leaves a `job: null` row; a closed role keeps
  its row and its `JobDto.status`; the `applied` join marks rows with and
  without applications; 404 saving a nonexistent job; 400 on a malformed id;
  the per-job check answers both states.
- Frontend: the description page's button — anonymous redirect with return
  path, toggle on click, Saved state from the per-job read; the list's three
  row states (open, closed, no-longer-available), the Applied marker, Unsave
  removing the row, pagination, and the empty state; the session nav link.

## Documentation

README's roadmap row flips to Complete. ARCHITECTURE gains the seeker-side
continuation (the SavedJob collection, the idempotent-toggle contract, the
list's keep-and-mark stance). A release note ships with the feature — a
shortlist is squarely user-visible.
