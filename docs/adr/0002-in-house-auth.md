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
