# ADR-0007: Deploy topology — platform-native, single instance

**Status:** Accepted (2026-08-10). Implemented in the deploy artifacts phase.

## Context

The README documented a deployment from Phase 1A onward and nothing implemented
it: no host configuration, no continuous delivery, and no SPA fallback — so
every route except `/` returned 404 on a static host. Measured against a fresh
build: `/jobs`, `/hire/login`, `/admin/review/jobs`, `/profile` and `/browse`
all 404, while `/` served. In-app navigation worked because that is
`history.pushState` and never reaches the host; refreshes, pasted links and
bookmarks did not — which is most of the traffic a job board receives.

Two shipped features were inert because of it. Phase 2B-2 existed to make a
filtered board a URL worth sharing, and every such link 404'd for the recipient.
The pre-3A workspace redirects are client routes, so a recruiter's old bookmark
never reached the redirect that existed to honour it.

## Decision

**Platform-native, not containers.** Render builds the API from source and
Vercel builds the web app. Nothing in this repository consumes an image, and a
second build path that no deploy exercises drifts out of correctness unnoticed.

**One instance, and that is a security parameter.** `rateLimitStore.ts` is a
single-process `Map` per [ADR-0004](0004-no-redis-phase-1.md). Every threshold
it enforces is therefore per-instance, and scaling out does not fail — it
multiplies:

| Control | Configured | Effective at 2 instances |
|---|---|---|
| `LOGIN_LOCK_THRESHOLD` | 5 | ~10 |
| `OTP_BUDGET_MAX_FAILURES` | 20 | ~40 |
| `OTP_MAX_ATTEMPTS` | 5 | ~10 |

Nothing surfaces this at the point of change. The dashboard control is a number
field beside the plan selector, and someone scaling up to handle traffic has no
reason to connect it to brute-force resistance. `numInstances: 1` is therefore
in committed configuration with the reason attached, not in a dashboard.

**`NODE_ENV` and `COOKIE_SAMESITE` are pinned literals in the blueprint.**
`env.ts` defaults `NODE_ENV` to `development` and `cookies.ts` keys both the
`Secure` attribute and the `__Host-` prefix off it, so an API deployed without
it serves over HTTPS setting insecure cookies — no error, no warning, `/health`
still `ok`. The guardrail against weakening a cookie flag held in the code and
was silently void in deployment, and the variable that voided it is the one a
host does not require you to set. `COOKIE_SAMESITE=none` is pinned for the
related reason: Render and Vercel are different registrable domains, so under
`strict` the session cookie is never sent after login.

**Deploy hooks, not CLI tokens.** A hook is scoped to one project and one
branch. A `VERCEL_TOKEN` can act on every project in the account, so a leaked
token is an account compromise rather than one unwanted deploy.

## Consequences

- Horizontal scaling now has a documented prerequisite. Someone who wants a
  second instance finds this file and ADR-0004's three conditions, rather than
  discovering the coupling by weakening a lockout without noticing.
- A rewrite-all rule masks genuine 404s: any unmatched path returns the app
  shell with 200, so a mistyped asset URL renders the SPA rather than failing
  visibly. This is inherent to client-side routing on a static host, and it is
  why the not-found route shipped in the same phase — without it the rewrite
  turns a host 404 into a blank page.
- The deploy is triggered, not verified. A hook answers 202 once the deploy is
  queued and reports nothing about the build. Verifying the deployed revision
  needs a polled health check against a public URL, which needs a stable public
  URL to exist first.
- Auto-deploy must be turned off in both dashboards. Left on, the host starts
  deploying on push while CI is still running, and the revision users get is the
  one the host chose rather than the one the workflow approved. `autoDeploy:
  false` covers Render; Vercel's is a dashboard setting this repository cannot
  set.

## Amendment, 2026-08-11: auto-deploy is on

The last consequence above is **reversed**. `render.yaml` now sets
`autoDeploy: true`, matching Vercel, and pushing to `main` deploys both apps.

The gate described here was never operational. It had two halves — `autoDeploy:
false` so the host would not deploy, and `cd.yml` POSTing a deploy hook once CI
passed so that something would. Only the first shipped: the
`RENDER_DEPLOY_HOOK_URL` and `VERCEL_DEPLOY_HOOK_URL` secrets were never added,
so both deploy steps skipped with a `::notice::` on every run since the deploy
phase. The effect was not a gated deploy but no automatic deploy at all, and
manual dashboard clicks in place of it — which is a *worse* position than
either design, because a hand-triggered deploy has no relationship to CI
whatsoever.

Given a half-built gate, the choice was to finish it or to drop it. Dropped,
deliberately: this is a single-maintainer project where the deploy hook secret
had gone unadded for a phase and a half, and a gate whose upkeep does not happen
is a gate that only ever blocks the person maintaining it.

What is given up is real and should not be minimised: **a push that fails the
suite now reaches users.** CI still runs and still reports, in parallel with the
hosts' builds rather than in front of them, so the feedback arrives — just after
the deploy rather than before. `cd.yml` remains the only check that executes the
built artifacts, and that value is unchanged.

Restoring the gate requires both halves in one change: add the two hook secrets
**and** set `autoDeploy: false`. Doing the second alone returns to the state
this amendment is correcting. `backend/tests/deployConfig.test.ts` asserts
whichever value is current, so the blueprint and the intent cannot drift apart
silently.
