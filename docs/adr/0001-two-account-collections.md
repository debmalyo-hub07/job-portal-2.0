# ADR-0001: Two account collections

**Status:** Accepted (2026-07-31) — implemented in Phase 1B

## Context

The inherited model is a single `users` collection with a `role` field of
`"student"` or `"recruiter"`. Login accepts `role` in the request body and
compares it against the stored value, which means the client asserts its own
role on every request.

Job seekers and recruiters have almost no overlapping fields. A seeker has a
resume, skills, and experience; a recruiter has a company and a designation. In
one collection, most fields are null for any given document, and every query has
to remember to filter by role.

There is also a real-world requirement: a person may legitimately be both. A
hiring manager at one company may be job-hunting at another. Naukri and
Internshala both allow this, treating the two as separate accounts.

## Decision

Split into `seekers` and `recruiters`. Email is unique **within** a collection,
not globally, so the same address may hold one account of each type.

Auth routes are portal-scoped:

```
/api/v1/seeker/auth/*
/api/v1/recruiter/auth/*
```

The route determines which collection is read. `role` is removed from every
request body.

Shared auth fields (`email`, `emailVerifiedAt`, `passwordHash`, `googleId`,
`status`, lockout counters) live in a reusable schema fragment so one auth
implementation can operate on either collection without merging them.

## Consequences

**Good**

- The collection is the role. A token minted for the seeker portal cannot
  address a recruiter route, so a client can no longer assert its own role.
- No `requireRole` middleware is needed — it would be redundant state that can
  drift out of sync with the collection describing it.
- Each schema holds only fields that apply to it, so `required` constraints
  become meaningful and indexes are smaller.
- One person can hold both account types, matching real usage.

**Bad**

- Google OAuth needs to know which portal it is acting for, since Google returns
  one verified email that may exist in both collections. Solved by encoding the
  portal in the OAuth `state` parameter.
- Any future feature spanning both types needs two queries or an aggregation.
- Requires a migration splitting existing `users` documents by their `role`
  field.

## Alternatives considered

**One collection with a discriminator.** Mongoose supports this and it avoids
the migration, but the role stays a mutable field on a shared document —
precisely the property that lets a client claim to be a recruiter. Rejected.

**Two collections, email globally unique.** Simpler for OAuth, since no portal
context is needed. Rejected because it requires a cross-collection uniqueness
check on every signup — a race condition unless carefully done — and it
permanently prevents anyone from being both a seeker and a recruiter.

## Amendment (2026-08-04) — implemented in Phase 1B

The split shipped. Two implementation facts are load-bearing for anyone reading
the model later:

**`_id` was preserved verbatim.** The migration copied each `users` row's `_id`
onto its new `seekers` or `recruiters` row rather than minting a fresh one. That
is the only reason `applications.applicant`, `jobs.created_by` and
`companies.userId` still resolve — the values in those columns are the old ids.
Any future re-migration must preserve `_id` too; a script that generates new ones
silently dangles the entire object graph, and nothing fails loudly when it
happens.

**The `ref` fields were repointed, not backfilled.** `applications.applicant`
now declares `ref: "Seeker"`, `jobs.created_by` and `companies.userId` declare
`ref: "Recruiter"`. No document was rewritten; only the schema's populate target
changed, which works precisely because of the `_id` preservation above.

Migrated accounts are deliberately **not** grandfathered as verified. The spec
originally said to grandfather them, on the grounds that they were usable
before. They are not, for two reasons: an address that was never proven is
auto-linkable by a Google sign-in claiming it, and the resend-code flow makes
recovery a single click. `migratedFromLegacyAt` marks these rows so the
unverified-account sweeper does not delete the entire inherited userbase on its
first tick.
