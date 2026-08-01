# ADR-0005: Cookie sessions with CSRF tokens

**Status:** Accepted (2026-07-31) — **amended 2026-08-01**, see
[Amendment: cookie naming](#amendment-2026-08-01--cookie-naming-replaces-path-scoping)

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

**Refresh token cookie** — the same, plus a distinct name per portal
(`__Host-jp_seeker_rt`, `__Host-jp_recruiter_rt`) so each portal's cookie is an
independent security boundary. Both use `Path=/`.

The `__Host-` prefix enforces three constraints at the browser level (`Secure`, no
`Domain`, `Path=/`), which prevents cookie injection through insecure subdomains.
A separate refresh endpoint per portal is not needed — the refresh handler derives
the portal from the stored `refreshTokens.subjectType` column, *not* from the URL
mount path. The handler rejects any request where the stored subject type does not
match the email's account in the asserted portal's collection.

This replaces the earlier design of a single `path: "/api/v1/*/auth/refresh"`
cookie. Cookie `Path` is a literal prefix match; `*` has no special meaning and
no browser honours such a wildcard. A single path-scoped cookie would therefore
never reach *either* portal's refresh endpoint, breaking login for everyone.

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
- The `__Host-` prefix makes the browser itself refuse a cookie that lacks
  `Secure`, carries a `Domain`, or is scoped to a narrower path. A subdomain
  compromise (`staging.example.com`) therefore cannot overwrite a session cookie
  for the apex origin — a guarantee no server-side check can provide.
- Per-portal cookie names mean a seeker refresh cookie and a recruiter refresh
  cookie coexist in one browser without either overwriting the other, so a user
  who is legitimately both does not get logged out of one portal by using the
  other.

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
- `Path=/` means the refresh cookie rides along on *every* API request, not only
  the refresh call. That is a real loss of the exposure reduction we thought
  path-scoping bought, and it is unavoidable: the alternative is not a narrower
  path but a broken one. The cookie is `httpOnly`, so the exposure is limited to
  the TLS channel and the server's own logs — which means request logging must
  never serialize the `Cookie` header.
- `__Host-` requires HTTPS even in staging, and forbids `Domain`, so an API on a
  different registrable domain than the web app cannot share these cookies. This
  is compatible with the `COOKIE_SAMESITE=none` split-domain deploy (each origin
  sets its own `__Host-` cookies) but rules out one cookie spanning
  `api.example.com` and `app.example.com`. Local development over plain HTTP
  cannot use the prefix, so the name is assembled from config rather than
  hardcoded — the prefix is applied when `secure` is on.

## Alternatives considered

**`localStorage` + bearer token.** No CSRF concern, works trivially
cross-domain, and standard in SPA tutorials. Rejected: a readable token is a
worse trade than a CSRF requirement, because CSRF has a well-understood
mitigation while token theft via script has none.

**Server sessions in Redis.** Trivial revocation and no token-expiry complexity.
Rejected for Phase 1 per ADR-0004 — it requires running Redis, and hashed
refresh tokens in Mongo already give us revocation.

**A real path-scoped refresh cookie per portal**, e.g.
`Path=/api/v1/seeker/auth/refresh`. This works — no wildcard, so browsers honour
it — and it restores the exposure reduction that `Path=/` gives up. Rejected
because it is incompatible with the `__Host-` prefix, which mandates `Path=/`.
Between the two, `__Host-` is worth more: it defeats cookie injection from an
insecure or compromised subdomain, an attack that grants the attacker a session,
whereas the path-scoping benefit only narrows the transmission surface of a
cookie that is already `httpOnly` and TLS-bound. Revisit if we ever stop
terminating TLS everywhere.

## Amendment 2026-08-01 — cookie naming replaces path scoping

The original decision path-scoped the refresh cookie to
`/api/v1/*/auth/refresh`. That is not implementable. Cookie `Path` is compared as
a literal prefix (RFC 6265 §5.1.4); `*` is an ordinary character, so the cookie
would only ever be sent to a URL beginning with the literal string
`/api/v1/*/auth/refresh` — a path no route serves. The bug is silent in the worst
way: `Set-Cookie` succeeds, the browser stores the cookie, and it is simply never
transmitted. Every session would end at the first access-token expiry, fifteen
minutes after login, with no error anywhere to explain why.

Two changes follow, both driven by the session-security review that ran after
this ADR was accepted:

1. **Naming, not paths, isolates the portals.** `__Host-jp_seeker_rt` and
   `__Host-jp_recruiter_rt` at `Path=/`. Distinct names mean a browser holding
   both a seeker and a recruiter session keeps them separate, which the
   two-collection model (ADR-0001) requires — one person may legitimately be
   both.

2. **The portal comes from the database row, never from the URL.** The refresh
   handler looks up the presented token's hash, reads `subjectType` off the
   stored row, and issues a session for *that* portal. Deriving the portal from
   the mount path instead would be a privilege-escalation vector: a seeker's
   refresh cookie presented to the recruiter mount would mint a recruiter
   session. With per-portal cookie names the wrong cookie does not even arrive,
   but the handler must not depend on that — defense in depth is the point, and a
   future client that sends both cookies must not be able to choose its own
   privilege level.

The related finding — that the two portals need *separate refresh-token signing
inputs*, so a token minted for one collection cannot verify against the other —
is recorded in the design spec rather than here, because it concerns token
construction rather than cookie transport.
