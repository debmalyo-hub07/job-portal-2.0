# The recruiter power phase — bulk moves and posting health

Date: 2026-09-02
Status: approved design, pre-implementation

## The problem

The roadmap's committed Phase-4 remainder. The workspace after P5 is
complete but hand-scale: a recruiter closing a role rejects applicants one
click at a time, and a posting that attracts nobody is indistinguishable
from one attracting plenty until the recruiter drills into it. Two things
close the gap: decisions that apply to many applicants at once, and per-role
health a recruiter can read at a glance.

## Decisions

**D1 — Bulk is apply-where-legal, never all-or-nothing.** One endpoint,
`POST /application/:jobId/status/bulk` with `{ applicationIds: string[],
status }` (a shared `bulkStatusBodySchema`; the ids array is capped at 100 —
larger than any page the screen holds, small enough to bound one request's
work). The job's ownership is checked once; each row then runs the SAME
guarded state machine a single move runs (`transitionRefusal` is pure, so
each outcome is known before any write). Legal rows move — history entry,
`decidedAt` on terminal stages, the candidate email on notifying stages,
byte-for-byte as today. Refused rows are skipped and reported with their
reason: `TERMINAL`, `SAME_STATUS`, or not-found for an id that no longer
answers (a stale list). The response is
`{ success, moved, skipped: [{ id, reason }] }`. The alternative — refusing
the whole batch because one row is already rejected — is rejected: a real
applicant list is mixed, and one decided row must not veto nine open ones.

**D2 — Foreign applications are skipped, not 404s.** A single move answers
a foreign application exactly as a missing one (the ownership check is
normalized to NOT_FOUND there). Bulk cannot 404 the request for one foreign
id — the other rows' work is legal — so a foreign or unknown id is a
skipped row with reason `NOT_FOUND`, and the request succeeds. The bulk
endpoint's own 404 is reserved for a job the caller does not own.

**D3 — The UI is a checkbox column, a bulk bar, and an honest result.** The
applicants table gains a checkbox column (selected ids held in client
state, cleared on page change); with one or more selected, a bar appears
above the table — "3 selected · Move to [stage] · Clear". A confirmation
dialog names the count and the destination stage; the result toast reports
both halves ("Moved 9 to shortlisted · 1 skipped — already rejected"), and
the list invalidates exactly as a single decision already does. Bulk reject
emails every rejected candidate — bulk is a shortcut through the same
rules, not a different rule.

**D4 — Posting health is derived, not queried.** `listApplicants` already
holds the job document and the complete ranked application set in memory;
`health` is computed from that with zero additional queries and rides the
same `ApplicantsPageDto` the funnel rides:

- `series` — a dense 56-day applications-per-day series (the admin
  console's `jobsPostedSeries` shape: every day present, zero-filled), so
  the client never infers gaps.
- `firstApplicationAt` — the earliest application's timestamp, null when
  nobody has applied. Time-to-first (the job's own `createdAt` is one field
  the caller already has) is the client's subtraction, not a server
  opinion.
- `total` — the same total the page already carries, restated where the
  health block reads.

Nothing is stored, nothing is tracked, nothing new touches the privacy
page: posting health is a view of application records the platform already
keeps.

**D5 — The health block sits with the funnel.** Above the applicants
table, beside P5's funnel strip: the series as a small chart (the console's
JobsTrend line-chart pattern, re-implemented on workspace tokens), the
total, and "first applicant after N days" (or "no applicants yet" — an
empty state that is an invitation to share the role, not a blank). The
chart is the one visual element and follows the platform's dataviz rules at
implementation time.

## Non-goals

- View tracking of any kind — it needs new infrastructure and a privacy
  decision (what is counted, where stored, what the policy page must say),
  and was rejected at scoping.
- Talent-pool rediscovery — parked, its own project if wanted.
- Bulk withdraw — `withdrawn` is the seeker's only transition.
- Bulk across jobs — the screen is one job's pipeline; the cross-job queue
  stays a read.
- Bulk with a reason — recruiter rejection carries no reason today; bulk
  does not invent one.

## Testing

- Shared: `bulkStatusBodySchema` (status within RECRUITER_SETTABLE, ids
  non-empty and capped).
- Backend: the bulk matrix — a mixed batch moves the legal rows and reports
  the refused ones with reasons; a foreign id and an unknown id are skipped
  as NOT_FOUND while the rest move; a job the caller does not own is the
  request's own 404; notifying stages mail exactly the moved rows (and
  `reviewed` mails nobody, as ever); same-status and terminal rows refuse;
  the cap rejects a 101-id body with 400; auth and CSRF as every write.
- Backend: the health derivation — a dense zero-filled series spanning gap
  days, `firstApplicationAt` null for an empty job, the total matching.
- Frontend: selection toggling and clear; the bar appearing at one; the
  dialog naming count and stage; the result toast reporting moved and
  skipped; the chart rendering the series; the empty state.

## Documentation

ARCHITECTURE gains the workspace paragraph's continuation (the bulk path
and its apply-where-legal contract; the health derivation). A release note
ships with the feature — both halves are squarely user-visible.
