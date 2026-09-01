# Admin alerts for new work — P1 of the console automation program

Date: 2026-09-01
Status: approved design, pre-implementation

## The problem

The console is pull-based. Every read polls itself (15s queue, 30s counters,
60s insights), but nothing tells an admin that work has *arrived* — the triage
band exists because a human must go and look. A recruiter can sign up,
verify, and sit in the approval queue for a day before anyone opens the
console. This project makes the console event-driven at its one urgent edge:
decisions that need a human.

It is deliberately the first project of the automation program because the
send path it builds (fan-out, per-recipient error isolation) is the
foundation P5's recruiter alerts reuse.

## Decisions

**D1 — The trigger is email verification, not registration.** The email fires
when a pending recruiter's `emailVerifiedAt` flips null → set. Registration
requires no proof of address: notifying on it would let anyone spray every
admin inbox by submitting the signup form with arbitrary emails. Verification
is the moment the signup becomes a real person with a real address, and it
matches the platform's own rule — an unverified row is "indistinguishable
from an abandoned signup" (the Phase 3A migration's filter is
`status: "pending", emailVerifiedAt: { $ne: null }`).

Two code paths flip that bit, and both notify:

- `verifyEmail`'s atomic redemption (`auth.service.ts`, the
  `{ $set: { emailVerifiedAt: new Date() } }` update) — the normal path.
- `resetPassword`'s verify-as-side-effect (the conditional spread
  `target.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}`)
  — the recovery path.

The helper fires only when the account is `portal === "recruiter"` **and**
`status === "pending"` at the moment of the flip. A seeker verifying, an
already-verified recruiter, or a suspended account never notifies. Each
account can flip the bit once, so no dedup mechanism is needed beyond the
event's own shape.

**D2 — Recipients are every active admin.** `Admin.find({ status: "active" })`
— the shared auth fields give the admin mount the same status enum every
portal has. There is no per-admin notification preference yet; at current
admin counts (one or two) a preference system is YAGNI. When prefs exist,
this query is where they plug in.

**D3 — Mail failure is isolated, per recipient and from the request.** A
notification is a courtesy; the product is the verification. `notifyAdmins`
catches per-recipient send failures (one admin's bounce never blocks the
others) and never lets a mail outage fail the verification or reset request.
Failures log through `describeMailerError` — reason and status code only, no
bodies, no keys. This is the deliberate opposite of invite-admin, where the
email *is* the deliverable and mail failure fails the request.

**D4 — Content is one plain transactional email.** Subject names the event
("New recruiter waiting for review"); body carries the recruiter's name and
email, how many are now waiting, and a link to `/admin/recruiters`. The
waiting count uses the same filter every console surface uses —
`{ status: "pending" }`, the queue's own query — so the number in the email
matches the number the admin sees on click-through. Rendered by
`renderAdminPendingEmail` following the existing `Rendered` template pattern
(`emailTemplates.ts`).

**D5 — `notifyAdmins` is the foundation, not a framework.** One helper:
query active admins, render the template once, send per recipient with
isolation. It is NOT generalized to arbitrary recipients or channels — P5's
applicant alerts notify a single recruiter, a different fan-out, and the
generalization happens when that consumer exists and can shape it
(YAGNI until then).

## Non-goals

- Companies-missing-branding alerts — aggregate drift, not an event; belongs
  with a digest concept that does not exist yet.
- Any in-app notification center or unread badge.
- Recruiter-side alerts (P5 of the program).
- Notification preferences UI.
- New environment variables — Brevo is already configured.

## Testing

The mailer is a wholesale-replaced test seam, so no test opens a socket:

- Fan-out: N active admins, N sends, each with the rendered body.
- Isolation: one recipient's `send` rejecting does not prevent the others
  and does not reject the helper.
- No-fire cases: seeker verification, already-verified recruiter, suspended
  recruiter, and the second flip site guarded the same way.
- Request-path survival: a mailer that always throws leaves verification
  and password reset succeeding.

## Documentation

ARCHITECTURE.md gains the notification path and its failure posture beside
the polling paragraph it extends. A release-note entry ships in the same
commit as the implementation.
