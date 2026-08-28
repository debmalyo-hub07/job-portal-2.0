# ADR-0001: Two account collections

**Status:** Accepted (2026-07-31) — implemented in Phase 1B; **email uniqueness
reversed cross-portal 2026-08-27**, see
[Amendment: one address, one account](#amendment-2026-08-27--one-address-one-account)

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
*(Adopted 2026-08-27 — the race is resolved by the registry collection's unique
index and the dual-account capability was given up deliberately; see the
amendment below.)*

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

## Amendment 2026-08-27 — one address, one account

The decision this ADR records — email unique **within** a collection, so one
address may hold a seeker and a recruiter account — is reversed. One email
address now holds exactly one account across `seekers`, `recruiters` and
`admins`. Registering an address that exists on any portal returns
`EMAIL_TAKEN`.

The reversal is a product decision, taken knowingly: the dual-account
capability was the single most surprising behaviour for a new reader, the
platform wants one person to be one login, and a scan at the moment of decision
found zero cross-portal collisions in production or dev — so nobody loses an
account and no data migration is needed beyond a backfill.

The mechanism is an `emailRegistry` collection — one row per account
`{ email, portal, subjectId }` with a unique index on `email` — rather than an
application-level check across the three collections, because two concurrent
registrations on different portals both pass such a check. The registry's
unique index is the guarantee, the same doctrine `register()` already stated
for its own index. The per-collection unique indexes stay as a backstop that
makes registry drift fail loudly on the same portal. A backfill script writes
one row per existing account (a collision during backfill fails loudly — that
failure is the re-verification of zero collisions), a reconciliation script
repairs the two crash shapes (an orphan row whose account create failed, a
stale row left mid-email-change), and the unverified-account sweeper deletes a
swept account's registry row so an abandoned registration gives the address
back.

What the split was actually for is untouched: the collection is still the role,
`_id` preservation and the `ref` repointing above still hold, and every
route still names its portal as a server-owned literal. The 2026-08-27 change
concerns only who may hold an address — and adds the ability to change it,
which the old model never had. See `docs/superpowers/specs/2026-08-27-email-identity-design.md`
for the full design.
