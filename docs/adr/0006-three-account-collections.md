# ADR-0006: Three account collections

**Status:** Accepted (2026-08-06) — supersedes ADR-0001. Implemented in Phase 3A.

## Context

ADR-0001 split the inherited `users` collection into `seekers` and
`recruiters`, and made auth routes portal-scoped. Phase 3A adds a third role,
admin, whose first job is approving recruiters.

The reason that job exists: recruiter registration was open to the world.
`register()` was identical for both portals, so `POST
/api/v1/recruiter/auth/register` created a fully-privileged recruiter for any
caller, and the Google callback's "complete stranger" branch created an account
on whichever portal it was invoked from — so "Continue with Google" on
`/hire/signup` self-provisioned a recruiter too. The two-portal split was real
in the code and decorative in effect: anyone could stand on either side of it.

## Decision

Add an `admins` collection and a third value to `Portal`, rather than an
`isAdmin` flag on `recruiters`.

The portal boundary here is **cryptographic, not conditional**.
`accessTokenKey(portal)` derives a per-portal signing key with HKDF
(`info: "access:" + portal`), and `accessCookieName(portal)` yields a
per-portal cookie. A token minted for one portal therefore fails *signature
verification* at another portal's mount, before any claim is inspected — the
claim check is a second, independent defense rather than the only one.

A boolean flag would put admins and recruiters on one signing key and collapse
that boundary to a single comparison, which is precisely the fragility the
comment on `accessTokenKey` was written to warn against. The cost of a third
collection is one file; the cost of a flag is that the highest-privilege role
in the system is one `if` away from the second-highest.

Admins are never self-served: `buildAuthRouter("admin")` mounts no `/register`
and no `/google*` routes, and the first admin is created by
`npm run seed:admin --workspace @jobportal/api`.

## Consequences

`accountModel` is a `Record<Portal, Model>` rather than a conditional, exactly
so a new portal is a **compile error** at every site that needs a case. Widening
the enum surfaced them: `sweeper.ts`'s per-portal count map and the frontend's
`AUTH_COPY` table. `keys.ts` and `cookies.ts` needed no change at all — both
already derived everything from the portal string.

Three `subjectType` enums (`otpCode`, `otpBudget`, `refreshToken`) were literal
two-portal lists and are now derived from the shared `PORTALS`. These are
runtime validators rather than types, so they would **not** have failed to
compile — an admin OTP would have been rejected by Mongoose validation at the
first `seed:admin` run instead.

The unverified-account sweeper now covers all three collections, also derived
from `PORTALS`. An unverified admin squats the unique email index exactly as any
other account does, and `seed:admin` creates admins already verified, so any
sweepable admin is by definition abandoned.

`authenticateAny` and `optionalAuthenticate` deliberately keep a literal
two-portal list. They resolve whoever the browser happens to be on domain
routes; an admin is an authority over that domain, not a participant in it, so
an admin cookie must never silently satisfy a route that meant "some signed-in
user". Admin routes name their portal with `authenticate("admin")`.
