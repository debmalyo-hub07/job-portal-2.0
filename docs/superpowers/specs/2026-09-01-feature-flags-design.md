# Feature flags — P3 of the console automation program

Date: 2026-09-01
Status: approved design, pre-implementation

## The problem

The automation program's next project (P4) wires a guardrailed auto-approve
tier into recruiter approval — a behavior that must ship **off** and be
killable at runtime, without a deploy. Nothing in the platform can do that
today: every behavior is either compiled in or configured by environment
variables, and both require a rebuild and a redeploy to change. This project
builds the flag system P4 needs, sized to what the program will actually
consume and deliberately nothing more.

## Decisions

**D1 — Flags are defined in code, overridden in the database.**
`packages/shared` gains a `FLAG_REGISTRY`: an array of
`{ key, description, default }`, with the keys exported as a TypeScript
union. Server and client code reference flags by that union — a typo is a
compile error, a default ships in the PR that introduces the behavior, and
the database cannot accumulate flags nobody reads. The database stores only
*deviations*: one `FeatureFlag` row per flipped flag. A key with no row
resolves to its registry default. Removing a flag from the registry makes
any surviving row inert (reads skip unknown keys; the admin list shows only
registry keys), and a startup or sweep can delete orphans later — no
migration needed on day one.

**D2 — A flag is one global on/off switch.** Every consumer the program has
(P4's auto-approve tier) is a platform-wide behavior. Per-portal or per-role
granularity roughly doubles the schema, the write API and the console UI for
a consumer that does not exist; when one becomes real, the override row
grows a scope field and the resolver learns one step — a contained change,
not a rewrite. This is an explicit non-goal, not an oversight.

**D3 — The read path caches in memory for ~15 seconds.** `flagEnabled(key)`
in a new `flags.service.ts` reads the overrides collection through a small
TTL cache, valid because the deploy is single-instance — the same reasoning
the in-memory rate-limit store already rests on (ADR-0004's world).
A flag flip is a kill switch measured in seconds, not a deploy measured in
minutes; 15s is the ceiling a human pressing a console toggle would never
notice. The cache invalidates immediately on `setFlag` in the same process.

**D4 — The write path is two admin routes.** `GET /admin/flags` answers the
registry with each flag's resolved value and, where a row exists, who last
changed it and when. `PUT /admin/flags/:key` sets `enabled`, validating the
key against the registry (an unregistered key is a 400, not a new flag),
upserting the override row, recording the acting admin id and time, and
logging the flip. CSRF and an active-admin session, like every admin
mutation.

**D5 — The client reads flags from a public endpoint.** `GET /flags`
mounts like the location router (`/api/v1/flags`) and answers the resolved
values for every registry key. Flag state is not a secret: the client needs
it to branch UI, and an unauthenticated read with no parameters keeps the
hook trivially cacheable. The frontend `useFlags()` hook reads it through
react-query.

**D6 — The console gains a Flags screen.** `/admin/flags`, a sixth nav
section beside Dashboard. One row per registry flag: the key, its
description, the current resolved state, and a toggle that PUTs and
optimistically updates (the row also shows who last flipped it and when,
where a row exists). A control surface, not a settings page — the platform
has a handful of flags at most and the design should not pretend otherwise.

**D7 — The registry ships with P4's flag, off.** `autoApproveRecruiterSignups`,
default `false`, description naming it as reserved for the approval
automation (P4) and inert until that wires it. The screen has something real
to render on day one and P4's key is pre-registered rather than invented
mid-project.

**D8 — ADR-0009 records the posture.** Flags here are an operator's kill
switch, not an experiment platform: no percentage rollouts, no per-user
targeting, no scheduling. The moment any of those is wanted, both the cache
and the store need rethinking (multi-instance breaks the in-memory cache by
itself) — that is a different ADR.

## Non-goals

- Per-portal, per-role or per-user flag scopes (D2).
- Percentage rollouts, targeting, or scheduled flips (D8).
- A flag history table — the row records the last flip; the log line records
  every flip.
- Client-only flags. Every flag is resolved server-side; the client reads
  the same resolution the server acts on.

## Testing

Backend (the mailer-style seams already exist for none of this — the flag
service hits Mongo directly through the memory server):

- `flagEnabled`: registry default with no row; an override row wins; a
  flipped flag is visible to the next read after the TTL (or immediately
  after `setFlag`, via invalidation); an unregistered key cannot be passed
  (compile-time) and a stale DB row for a removed key is ignored.
- Admin routes: the auth/CSRF matrix (anonymous → 401, seeker/recruiter
  sessions → 401, admin without CSRF → 403); `PUT` of an unregistered key →
  400; a successful `PUT` upserts and records the acting admin; `GET` shows
  resolved values with the who/when where a row exists.
- Public `GET /flags`: answers every registry key with resolved values; no
  auth required.

Frontend:

- `useFlags()` resolves values from the endpoint.
- The Flags screen renders the registry, toggles optimistically, surfaces a
  failed PUT, and names the last flipper where the API sent one.

## Documentation

ADR-0009 (the kill-switch posture and the single-instance cache), an
ARCHITECTURE section for the flag path, and a release note — the console
gains a visible screen, which the updates page should say.
