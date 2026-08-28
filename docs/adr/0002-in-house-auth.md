# ADR-0002: In-house authentication rather than a managed provider

**Status:** Accepted (2026-07-31)

## Context

The inherited auth is hand-rolled JWT in a cookie with several defects: a
`httpsOnly` typo where `httpOnly` was intended (leaving the cookie readable by
JavaScript), no `secure` flag, no email verification, no password policy, no rate
limiting, and no way to revoke a session.

Those need fixing regardless. The question is whether to fix them ourselves or
hand authentication to Clerk, Auth0, or Supabase Auth.

This project is intended for real users, which raises the bar: email
verification, password reset, and session revocation are requirements, not
polish.

## Decision

Build authentication in-house, using well-reviewed primitives rather than
hand-rolled cryptography: `argon2` for hashing, `jsonwebtoken` for access
tokens, `node:crypto` for random generation, Brevo for delivery, and Google's
published JWKS for OAuth verification.

## Consequences

**Good**

- No vendor dependency in the login path, and no pricing cliff as users grow.
- Full control over the account model, which ADR-0001 needs — most providers
  assume one user record per email and do not accommodate the same address
  holding both a seeker and a recruiter account.
- The security work is visible in the codebase, which matters for a portfolio
  project whose purpose is partly to demonstrate exactly this.
- No user data leaves our infrastructure beyond transactional email.

**Bad**

- Considerably more code to write and maintain: rotation, reuse detection,
  lockout, OTP lifecycle, and OAuth linking are all ours to get right.
- We own the consequences of any mistake in that code.
- MFA, SSO, and social providers beyond Google are additional work rather than
  configuration.
- Requires a genuine test suite around auth. Mitigated by making the
  authorization matrix the highest-priority test target.

## Revisit when

- Enterprise SSO (SAML, OIDC) is required — do not build that.
- MFA beyond email OTP is required.
- The maintenance burden of the auth code demonstrably outweighs its cost.

## Amendment (2026-08-04) — implemented in Phase 1B

Built as decided. Two things shipped beyond the scope this ADR described, both
worth recording because they are the parts a reader would not predict from the
decision above:

**Transparent bcrypt → Argon2id upgrade.** Inherited accounts carry bcrypt
hashes. Rather than forcing a reset, the verifier detects the algorithm by hash
prefix, verifies against it, and — on a *successful* login only — rehashes the
supplied plaintext with Argon2id and writes it back. The upgrade therefore costs
the user nothing and happens exactly once per account, at the only moment the
plaintext is legitimately available.

**Subject-bound peppered OTP hashes.** Codes are stored as
`HMAC-SHA256(OTP_PEPPER, "<subjectId>:<code>")`, not as a hash of the bare code.
Binding the subject into the digest is what stops a code issued for one account
being redeemed against another: the same six digits produce a different hash per
account, so a row lifted from one subject cannot match another's lookup. The
pepper being an env secret rather than a stored salt means a database dump alone
does not permit offline enumeration of a six-digit space.

The failure budget is cumulative per account per purpose rather than per code.
Per-code counting would have made five attempts unlimited: request a fresh code,
get five more.

## Amendment (2026-08-27) — the account model premise changed

The "Good" point above — full control over the account model, which ADR-0001
needs because most providers assume one user record per email — no longer cuts
both ways: since 2026-08-27 the platform itself assumes one account per email
(see ADR-0001's amendment). What remains load-bearing from that point is the
control itself: the email-change flow (password step-up, one code to the new
address, a two-code path for admins) and the `emailRegistry` collection that
enforces cross-portal uniqueness are exactly the kind of bespoke machinery a
managed provider would not have accommodated in this shape.
