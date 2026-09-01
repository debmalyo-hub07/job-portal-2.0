# Guardrailed approval automation — P4 of the console automation program

Date: 2026-09-02
Status: approved design, pre-implementation

## The problem

Recruiter approval is the platform's trust gate, and it is entirely manual:
every signup waits for a human. The console automation program's promise was
to automate the gate **without weakening it** — the flag shipped in P3
(`autoApproveRecruiterSignups`, default off) is the kill switch; this project
wires the tier behind it. The honest constraint: at the verification flip a
recruiter has a name, an email, and proof they control that email. Nothing
else. So the only strong signal computable is ownership of an address at an
employer's own domain.

## Decisions

**D1 — The bar is an employer-domain match.** When the flag is on and the
signup email's registrable domain equals an existing company's website
domain, verification approves the account immediately. Every other signup
queues for a human exactly as today. This is conservative by construction:
a genuinely new employer has no company row, can never match, and always
gets human review — automation only ever serves people joining employers
already on the platform. The worst case is someone who already controls an
address at an employer's domain entering without review, which is roughly
what a password reset at that address would allow anyway.

**D2 — Domain matching is local, normalized, and simple.** Both sides are
lowercased with scheme and a leading `www.` stripped; the match is exact
hostname equality against any company's website host. No DNS, no network,
no subdomain heuristics — v1 is deliberately strict, and a mismatch costs
nothing (the human path is unchanged).

**D3 — An auto-approval runs the full human path, with its own event.**
The guarded pending→active update, the approved email, the account event,
and the orphan sweep are the same machinery `approveRecruiter` runs — the
implementation extracts or shares that core so the two paths cannot drift.
Two things differ: the account event's kind is **`auto_approved`** (a new
kind in `recordAccountEvent`, `AccountEventDto`, the model's enum, and the
frontend history dialog's labels), and its actor is null with the reason
naming the matched company ("email domain matches <Company>"). The human
path's behavior is byte-for-byte unchanged, pinned by its existing tests.

**D4 — It fires at both verification flips, before the admin mail.** In
`verifyEmail` and the reset-password side-effect — the two places P1 wired —
the order is: flag on AND domain match → auto-approve (no "waiting for
review" email; no work arrived) → else → today's admin notification. With
the flag off, both flips behave exactly as P1 shipped them.

**D5 — Visibility is the event plus a real feed kind.** Auto-approvals
surface in two places: the recruiter's account history (the `auto_approved`
event), and the dashboard's activity feed — which today carries only domain
events (`job_posted`, `company_created`, …), so a new feed kind
`recruiter_auto_approved` joins `ADMIN_ACTIVITY_KINDS` and the activity
service's merge, with the matched company named in the item's detail. No
email; the kill switch is one console click away.

**D6 — The queue gets the signals as badges.** `listPendingRecruiters`
extends `PendingRecruiterDto` with `emailDomainKind: "free" | "custom"` and
`matchingCompany: string | null` — the same computation the auto-tier uses,
surfaced so human reviews get faster. The queue row renders them as badges
("Custom domain", "Matches <Company>", "Free mail"). This is the
assisted-review half, and it ships regardless of the flag.

**D7 — The free-provider list lives in shared.** A small curated list
(gmail, googlemail, outlook, hotmail, live, yahoo, icloud, proton,
protonmail, aol) in `packages/shared` beside the flag registry — one list,
one authority, usable by both the signal computation and any future UI.

## Non-goals

- Auto-approval on any custom domain (rejected in design: a domain costs
  dollars; the flag alone is not enough guard).
- Phone-derived signals — verification is dormant until an SMS provider
  key exists.
- Auto-denial of any kind.
- Per-domain rate guards — the flag is the guard; revisit if the platform
  ever sees domain abuse.
- Changes to what `approveRecruiter` does when a human clicks it.

## Testing

- The domain matcher: normalization (scheme, www, case), free-provider
  classification, and company-website matching — pure unit tests in shared
  or the backend service.
- The flip: flag off → today's behavior unchanged; flag on + match →
  active, `auto_approved` event with the matched company, approved mail,
  sweep, and NO admin notification; flag on + no match → queues and notifies
  exactly as today; both flip sites (verify-email and password reset).
- The human path: `approveRecruiter`'s existing behavior untouched (its
  tests are the pin).
- The feed: an auto-approval appears as `recruiter_auto_approved` with the
  company named.
- The queue: `listPendingRecruiters` carries the signals; the UI renders
  the badges.

## Documentation

ARCHITECTURE gains the automation paragraph's continuation (the bar, the
event, the feed kind). ADR-0010 records the policy decision — auto-approval
requires employer-domain proof — because a future refactor could weaken the
bar silently and the reasoning must survive it. A release note ships with
the feature (user-visible: recruiters from known employers get in
immediately once the flag is on).
