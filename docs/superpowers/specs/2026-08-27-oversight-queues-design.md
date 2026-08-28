# Oversight and Review Queues — Project D

**Status:** Implemented 2026-08-27. Decisions locked with the user 2026-08-27.

Fourth and last of the projects decomposed on 2026-08-26. It gives the admin
console the actions its counters imply, and the recruiter workspace the one
queue it was missing.

## Problem

Two asymmetries:

1. **The console counts what it cannot do.** The dashboard reports suspended
   recruiters, `status: "suspended"` exists in the schema and every
   authenticate path refuses it — and no interface anywhere sets it. An admin
   can approve a pending recruiter or deny one; there is no lever for an
   active recruiter who goes bad, no view of seekers at all, and no record of
   any decision once made. Suspension today is also a dead end for its owner:
   a correct password reads "Incorrect email or password", by design, so the
   person cannot even learn why.
2. **A recruiter's applicants live one job at a time.** `/hire/jobs/:id/
   applicants` answers per posting; triaging a day's applications means
   walking the jobs list and opening each one. The workspace has no view of
   "everyone who applied to anything of mine".

## Decisions (locked with the user, 2026-08-27)

1. **Suspension requires a reason (1-500 chars), and the owner sees it** —
   after a correct password, login answers 403 `ACCOUNT_SUSPENDED` carrying
   the reason. A wrong password keeps the uniform `INVALID_CREDENTIALS`:
   account state is still not for strangers, and the only person who can see
   the reason is someone who already knows the password.
2. **A suspended recruiter's jobs stay live; applications to them are
   blocked.** Nothing is deleted and the board does not churn; apply answers
   403 `JOB_OWNER_SUSPENDED` with deliberately vague copy. Reinstatement
   restores everything untouched.
3. **Suspension kills every session immediately** — `sessionsInvalidatedAt`
   plus refresh-family revocation, the same machinery the email change uses.
4. **Every oversight decision is recorded.** An `accountEvents` collection
   rows approve/deny/suspend/reinstate with the reason and the acting admin;
   the console shows it per account. This is the "per-candidate status
   history" the decomposition named.
5. **Reinstate restores the prior state, not always `active`.** A recruiter
   suspended *by oversight* returns to `active`; one whose suspension *is a
   denial* returns to `pending` — back in the approval queue, not straight
   into hiring. The last recorded event tells the two apart.

## Design

### Model

- `authFields` grows a `suspension` fragment: `reason`, `suspendedAt`,
  `byAdminId`. `status` stays the driver every existing check reads; the
  fragment is what the login answer and the console display.
- `accountEvent` model: `{ portal, subjectId, kind, reason, actorAdminId,
  createdAt }`, `kind` ∈ approve/deny/suspend/reinstate. Indexed on
  `{ portal, subjectId, createdAt }`. No TTL — the history is the record.
  `approval.service.ts` records approve/deny from its existing functions, so
  the queue's decisions get history for free.

### The status-change service

`oversight.service.ts` owns suspend/reinstate for both portals:

- `suspend(portal, id, reason, adminId)`: guarded on `status: "active"`, so
  racing admins produce exactly one event and one mail; sets `status` +
  the `suspension` fragment, revokes every session, mails the owner the
  reason. Idempotent on an already-suspended account.
- `reinstate(portal, id)`: guarded on `status: "suspended"`; the most recent
  suspend/deny event decides the target — deny means the denial is being
  undone, so the account returns to `pending`; anything else returns to
  `active`. Clears the fragment, records the event, mails the owner.

### Login

The suspended branch in `login()` moves *after* the password check it
already sits behind and changes shape: 403 `ACCOUNT_SUSPENDED`, message
carrying the recorded reason. Nothing else about the ordering — lock burn,
dummy verify, uniform wrong-password — changes. `authenticate` keeps its
existing `SESSION_INVALID` for a live token on a suspended account: the
sessions are dead anyway, and the reason's channel is the login answer.

### Admin reads and routes

- `GET /admin/seekers` — paginated, keyword, same query shape as the jobs and
  companies listings. Row: id, name, email, status, a derived `minor`
  boolean, application count, registered. Hand-written projection like every
  other console read.
- `GET /admin/recruiters` — same shape: status, job count, application count.
  **This replaces the pending-only queue on the screen**; pending rows carry
  Approve/Deny there, active rows carry Suspend, suspended rows Reinstate.
- `POST /admin/seekers/:id/suspend|reinstate`,
  `POST /admin/recruiters/:id/suspend|reinstate` — reason body on suspend,
  CSRF like every admin mutation. Four separate routes with the portal as a
  route literal, never a `:portal` parameter — the AGENTS.md rule.
- `GET /admin/accounts/:portal/:id/events` — the history, newest first,
  actor's email populated. The `:portal` segment is validated against
  `PORTALS` (an unknown portal is a 400, not a collection guess).

### Apply blocked for a suspended owner

`applyToJob` loads the job's `created_by` alongside the open check and reads
the owner's status: suspended → 403 `JOB_OWNER_SUSPENDED`, copy that does not
name the reason ("This employer is not accepting applications right now.").
The public job detail page is untouched — the listing stays live by decision.

### The recruiter's cross-job queue

`GET /application/queue` — `authenticate("recruiter")` + `requireApproved`,
paginated, newest first: every application on every job the recruiter owns,
each row the existing `ApplicantDto` fields plus the job's id, title and
company name, with fit scored against that application's own job. Ownership
is resolved through the jobs the recruiter owns — a foreign application can
no more appear here than in the per-job list.

### Frontend

- Console: `AdminSeekers` (new, `/admin/seekers`, nav "Candidates");
  `AdminRecruiters` rebuilt on the all-recruiters listing with Suspend
  (reason dialog, mirroring Deny's) and Reinstate; a History dialog shared by
  both, reading the events endpoint.
- Workspace: `QueueApplicants` (new, `/hire/applicants`, nav "Applicants") —
  the cross-job table with a Job column linking to the per-job screen.
- `Login.tsx` renders `ACCOUNT_SUSPENDED` as the form-level error it is —
  the reason is the one thing the person can act on.

## Testing

- Backend: suspend requires a reason and kills sessions; login shows the
  reason only after a correct password; a suspended owner's job stays public
  but apply is refused; reinstate restores login, apply, and — for a denied
  recruiter — lands back in `pending`; approve/deny/suspend/reinstate all
  leave events; the listings paginate and keyword-match; the queue respects
  job ownership.
- Frontend: the seekers screen renders and suspends through the dialog; the
  queue renders the job column.

## Non-goals

- Seeker-side or recruiter-side self-service status views.
- Bulk actions, exports, or filters beyond keyword + pagination.
- Editing or deleting history — the record is append-only by design.
- Anything in Project C's consent flow beyond the derived `minor` boolean the
  seekers listing carries.
