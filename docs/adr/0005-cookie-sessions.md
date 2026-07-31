# ADR-0005: Cookie sessions with CSRF tokens

**Status:** Accepted (2026-07-31)

## Context

The session token has to live somewhere the browser can send it. The two options
are a cookie, or `localStorage` with an `Authorization` header.

`localStorage` is common in React tutorials and appealing because it sidesteps
CSRF entirely. But any script running on the page can read it — a compromised
npm dependency, an XSS hole, a malicious browser extension. A stolen token is
then replayable from anywhere until it expires.

The inherited code already uses a cookie, but with `httpsOnly: true`, which is
not a real cookie option. The intended flag is `httpOnly`. Because the typo
silently does nothing, the cookie is currently readable by JavaScript — the
`localStorage` weakness without the `localStorage` convenience.

## Decision

Cookies, with CSRF protection.

**Access token cookie**

```
httpOnly: true
secure:   true in production
sameSite: from COOKIE_SAMESITE — "strict" same-origin, "none" split-domain
maxAge:   15 minutes
```

**Refresh token cookie** — the same, plus `path: "/api/v1/*/auth/refresh"` so it
is only transmitted to the endpoint that consumes it.

**CSRF**: double-submit token. A random value is set in a readable (non-`httpOnly`)
cookie; the client echoes it in an `X-CSRF-Token` header; the server compares the
two. An attacker's site can cause the browser to send the cookie but cannot read
it to construct the matching header.

Additionally, `GET /apply/:id` becomes `POST`. A GET that mutates state can be
triggered by an `<img src>` on any page, and `sameSite` is the only thing
standing in the way.

## Consequences

**Good**

- The session token is unreachable from JavaScript, so XSS or a compromised
  dependency cannot exfiltrate it.
- `sameSite` provides defense-in-depth beyond the CSRF token.
- Refresh happens transparently — no client-side token-refresh logic, and no
  window where an expired token is used.
- Path-scoping the refresh cookie means it is not sent with ordinary API calls,
  reducing exposure.

**Bad**

- CSRF protection is now required, and every state-changing request must carry
  the header. Centralized in the Axios instance so individual call sites cannot
  forget.
- Cross-domain deployments need `sameSite=none`, which requires HTTPS on both
  origins and an exact-match CORS allowlist. Hence `COOKIE_SAMESITE` being
  configurable rather than hardcoded.
- Non-browser clients (a future mobile app) need a different mechanism. Deferred
  until one exists; a bearer-token path can be added for them without weakening
  the browser path.

## Alternatives considered

**`localStorage` + bearer token.** No CSRF concern, works trivially
cross-domain, and standard in SPA tutorials. Rejected: a readable token is a
worse trade than a CSRF requirement, because CSRF has a well-understood
mitigation while token theft via script has none.

**Server sessions in Redis.** Trivial revocation and no token-expiry complexity.
Rejected for Phase 1 per ADR-0004 — it requires running Redis, and hashed
refresh tokens in Mongo already give us revocation.
