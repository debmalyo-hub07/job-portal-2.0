# ADR-0004: No Redis in Phase 1

**Status:** Accepted (2026-07-31)

## Context

Redis is conventional in this stack, and three parts of the design could use it:
rate-limit counters, refresh-token and OTP expiry, and caching job search.

But it is a service to deploy, pay for, monitor, and recover — and a new way for
the API to fail when it is unreachable. The question is whether it earns that
today.

Examined per use case:

- **Token and OTP expiry.** MongoDB TTL indexes delete expired documents
  automatically. No extra infrastructure, and the data is already in Mongo.
- **Rate limiting.** In-memory counters are correct as long as exactly one API
  process serves traffic.
- **Caching job search.** Premature. There is no traffic to cache for, and a
  proper text index handles the current volume comfortably.

## Decision

No Redis in Phase 1. Instead:

- TTL indexes on `refreshTokens.expiresAt` and `otpCodes.expiresAt`
- Rate limiting behind an interface with an in-memory implementation:

```ts
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}
```

`InMemoryRateLimitStore` implements it today. A `RedisRateLimitStore` is a new
class and one line of config — not a refactor.

## Adopt Redis when any one of these becomes true

1. **More than one API instance runs.** Two instances with in-memory limiting
   gives an attacker 2× the login attempts, and lockout counters disagree between
   them. This is the trigger that matters, and it arrives the first time the app
   is scaled horizontally.
2. **Deployment moves to serverless** (Vercel functions, Lambda). In-memory state
   is meaningless when every invocation may be a fresh process. Immediate, not
   eventual.
3. **Transactional email moves to a background queue.** Brevo is currently called
   inside the signup request, so a slow Brevo means a slow signup. A BullMQ queue
   on Redis fixes that properly.

These conditions are reproduced in `ARCHITECTURE.md` under "Scaling triggers" so
they are visible to anyone planning a deployment change.

## Consequences

**Good**

- One less service to run, pay for, and monitor.
- No new failure mode from an unreachable cache.
- Faster local setup: `npm install` and a Mongo URI.
- The store interface means adoption is cheap when it is actually needed.

**Bad**

- Rate limits reset on API restart. Acceptable: a restart is not an attack
  vector, and lockout state that matters persists in Mongo.
- Horizontal scaling is blocked until this is revisited. Documented above rather
  than discovered under load.
- The in-memory store holds one map entry per active key, swept every 60 seconds.
  Bounded by traffic, not a leak, but not free either.
