# Deploy Artifacts — Design Specification

**Phase:** Deploy artifacts (not a roadmap phase; it precedes 2B-3)
**Date:** 2026-08-10
**Status:** Approved, not yet implemented

---

## Summary

The README has documented a deployment since Phase 1A. Nothing in the repository
implements it: no host configuration, no continuous delivery, and — the defect
that matters — no SPA fallback, so every route except `/` returns 404 in
production today.

This phase commits the deployment path the README already describes: Render for
the API, a static host for the web app, and a CD workflow gated on the existing
CI jobs. It adds no containers. Platform-native was chosen deliberately over
Docker: nothing here consumes an image, and a second build path that no deploy
exercises drifts out of correctness unnoticed.

It also adds the not-found route the app never had. That is not scope creep: the
SPA fallback is what makes an unmatched path reach the client at all, and without
a route to catch it the result is a blank page rather than the host's 404.

---

## Current-state audit

### Every route except `/` 404s on a static host

Verified, not inferred. A naive static server (serve what exists, 404 what does
not — what a static host does before any rewrite rule) over a fresh
`frontend/dist`:

| Route | Status |
|---|---|
| `/` | 200 |
| `/jobs` | **404** |
| `/jobs?keyword=react` | **404** |
| `/hire/login` | **404** |
| `/admin/review/jobs` | **404** |
| `/profile` | **404** |
| `/browse` | **404** |

There is no `vercel.json`, no `public/_redirects` and no `_routes.json` anywhere
in `frontend/`. The app is client-routed, so the host must serve `index.html`
for any path it cannot resolve to a file.

Two pieces of shipped work are inert in production because of this:

- **2B-2's shareable links.** That phase existed to make a filtered board a URL
  worth sharing. Every such link 404s for the recipient.
- **The pre-3A workspace redirects.** `/admin/jobs` → `/hire/jobs` is a client
  route, so a recruiter's old bookmark never reaches the redirect that exists to
  honour it.

A first visit to `/` works and in-app navigation works, because that is
`history.pushState` and never touches the host. The failure appears on refresh,
on a pasted link, and on a bookmark — which is exactly the traffic a job board
receives.

### `NODE_ENV` defaults to `development`, and cookie security keys off it

`env.ts:5` defaults `NODE_ENV` to `"development"`. `cookies.ts:18-20`:

```ts
function isSecure(): boolean {
  return env().NODE_ENV === "production";
}
```

`isSecure()` decides both the `Secure` attribute and the `__Host-` prefix. So an
API deployed without `NODE_ENV=production` boots normally, serves over the host's
HTTPS, and sets **every session cookie without `Secure` and without
`__Host-`** — no error, no warning, and `/health` still reports `ok`.

The guardrail in CLAUDE.md ("never weaken a cookie flag") holds in the code and
is silently void in deployment. The one var that voids it is the one var a host
does not require you to set. It is pinned in the blueprint for that reason.

### The rate-limit store is in-process, so instance count is a security parameter

`rateLimitStore.ts:9-14` is a single-process `Map`, per
[ADR-0004](../../adr/0004-no-redis-phase-1.md). Every threshold it enforces is
per-instance, so running two instances does not fail — it multiplies:

| Control | Configured | Effective at 2 instances |
|---|---|---|
| `LOGIN_LOCK_THRESHOLD` | 5 | ~10 |
| `OTP_BUDGET_MAX_FAILURES` | 20 | ~40 |
| `OTP_MAX_ATTEMPTS` | 5 | ~10 |

Nothing surfaces this. The dashboard control that changes it is a number field
next to the plan selector, and the person who scales up to handle traffic has no
reason to connect it to brute-force resistance. `numInstances: 1` therefore
belongs in committed configuration with the reason attached, not in a dashboard.

### The hosts' own default defeats a CD gate

Render and Vercel both auto-deploy on push once connected to a repository. Left
on, the host begins deploying while CI is still running, so gating deployment on
green CI achieves nothing — the deploy that reaches users is the one the host
started, not the one the workflow controls. Turning it off is a dashboard action
the repository cannot perform; it is documented as a required step.

### Nothing runs the built artifacts

`npm test` mounts `buildApp()` from source through vitest. No test executes
`node dist/server.js`, and no check inspects `frontend/dist`. A green suite is
therefore not evidence that either artifact runs — the same class of gap that
produced a blank page from an import-time throw while the suite passed, since
jsdom resolves through Node and the browser through Rolldown.

Two related claims are currently unenforced:

- CLAUDE.md says the production build "is verified to not contain" `/_design`.
  Nothing verified it. It does hold on a fresh build — confirmed by grepping the
  bundle — but only by construction, and nothing would catch a regression.
- `backend/package.json` sets `main: dist/index.js` while the entry point is
  `dist/server.js`. Harmless today because `npm start` names the file directly;
  noted so it is not mistaken for the boot path.

---

## Design

### 1 · SPA fallback — two files, three hosts

`frontend/vercel.json` rewrites every unresolved path to `/index.html`.
`frontend/public/_redirects` carries `/* /index.html 200`, which serves both
Netlify and Cloudflare Pages. Both files ship, because the README names all
three hosts and a reader following it must not have to know which dialect their
host speaks.

`_redirects` lives in `public/` so Vite copies it into `dist` verbatim — no
build step, and it cannot fall out of sync with the output directory.

The status code is **200, not 302**: the client router reads the original path
off `window.location`, so a redirect would rewrite the URL and lose the route.
This is a rewrite, not a redirect.

### 2 · A not-found route, which the fallback makes mandatory

The rewrite rule has a consequence that must be handled in the same phase:
**there is no catch-all route.** `appRoutes` enumerates 30 literal paths and
`RootLayout` renders only `<PortalScope><Outlet /></PortalScope>`, so an
unmatched path matches nothing and renders nothing.

Today `/typo` gets the host's own 404 page — ugly, but it tells the visitor the
page does not exist. With the rewrite and nothing else, the host returns 200 and
`index.html`, the router matches no route, and the visitor gets a **blank white
page**. That is strictly worse than what it replaces, and the fallback is what
causes it. Shipping the rewrite without this is shipping a regression.

So `{ path: "*", element: <NotFound /> }` lands last in the table, rendering the
existing `EmptyState` inside `PageShell` with a link home. It is a
composition-layer page like any other, and it needs no new primitives.

Two details it must get right: it sends `Navbar` above the shell like every other
seeker page, and its `<h1>` is the page's own title, so the one-`h1`-per-route
rule `seekerBoard.test.tsx` enforces still holds on a path that matches nothing.

### 3 · `render.yaml` blueprint

Committed infrastructure rather than dashboard state:

- `rootDir: .` with the build command in workspace order — `shared` builds
  before `api`, the same ordering constraint the root `ci` script encodes
- `healthCheckPath: /health`, which already reports DB connectivity
- `numInstances: 1`, commented with the rate-limit coupling above
- `NODE_ENV: production` pinned as a literal value
- All 15 required variables declared with `sync: false` — the name is in git,
  the value never is

`sync: false` also makes a fresh deploy fail loudly on a missing variable rather
than starting with a blank one, which matches how `env()` already behaves.

### 4 · `.github/workflows/cd.yml`

A reusable workflow invoked by `ci.yml` with `needs: [verify, audit]`, so
deployment cannot begin until both existing jobs pass. Guarded to `push` on
`main`. A separate file keeps deploy concerns out of the verification workflow
while the `needs` edge guarantees the ordering; triggering on `workflow_run`
would express the same intent with a weaker guarantee and an indirection.

Two gates run before either deploy:

**API smoke test.** Build, then run the real entry point — `node dist/server.js`
— against a `mongo:7` service container, with throwaway secrets generated in the
step, and assert `/health` returns `status: ok` and `db: connected`. A real
mongod rather than `mongodb-memory-server`: the deployed API talks to a server
over a connection string, and that is the thing worth rehearsing. This is the
only check in the repository that proves the shipped artifact boots.

**Web artifact check.** Fresh `vite build`, then assert `index.html` exists, that
it references a hashed asset, and that `/_design` is absent from the bundle —
turning the CLAUDE.md claim into an enforced one.

**Deploy via deploy-hook URLs, not CLI tokens.** A hook is scoped to one
project and one branch; a `VERCEL_TOKEN` can act on every project in the
account, so a leaked token is an account compromise rather than one unwanted
deploy. Two repository secrets, both plain URLs:

| Secret | Where it comes from |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → service → Settings → Deploy Hook |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel → project → Settings → Git → Deploy Hooks |

A missing secret **skips its step with an explicit log line** rather than failing
the run or silently succeeding. Red CI for a deploy that was never configured
trains people to ignore CI; a silent skip leaves "I pushed, why is it not live?"
unanswerable. The log line is what distinguishes them.

### 5 · Tests

`backend/tests/deployConfig.test.ts` and
`frontend/tests/deployArtifacts.test.ts`:

- **Env parity, the load-bearing one.** Parse the required variables out of
  `env.ts`, then assert each appears in `backend/.env.example` *and* in
  `render.yaml`. A new required variable then fails a test instead of failing a
  production boot. Both directions are checked, so a variable deleted from the
  schema cannot linger in the blueprint either.
- `vercel.json` and `public/_redirects` exist and rewrite unresolved paths to
  `/index.html` with status 200
- `render.yaml` keeps `numInstances: 1` and `NODE_ENV: production`
- Both files parse — a malformed blueprint is a deploy-time failure otherwise
- **An unmatched path renders the not-found page, not nothing.** Asserted
  through `renderAppAt` against the real route table, with exactly one `<h1>`,
  matching the rule the seeker board already enforces. This is the assertion
  that stops the rewrite from shipping as a blank page

Every assertion is verified to fail against current `main` before it is kept, as
in 2B-2. The env-parity test is checked by deleting a variable from
`.env.example` and confirming it names that variable.

Per the repository's own rule, each test that scans a file asserts it read
something: a parity test that resolves to a nonexistent path and iterates zero
variables passes vacuously, which is how `workspaceRoutes.test.tsx` first
shipped.

### 6 · Documentation

- README deployment section: the fallback requirement, the blueprint, the
  auto-deploy-off step, and the two secrets
- `docs/adr/0007-deploy-topology.md`: records single-instance as a deliberate
  consequence of ADR-0004, so the next person who wants to scale horizontally
  finds the Redis prerequisite instead of discovering it by weakening a lockout
- CLAUDE.md: the `/_design` claim becomes a claim with a check behind it

---

## Out of scope

- **Containers.** Platform-native was chosen; an unexercised second build path
  drifts
- **Putting `/profile` behind `ProtectedRoute`.** Still the known gap it was.
  Worth noting that the fallback changes its exposure from "unreachable by link
  in production" to "linkable" — both its requests still 401 and no data leaks,
  but the gap becomes visible where it previously was not. It belongs with the
  seeker session work
- **Redis and horizontal scaling.** ADR-0004 stands; this phase records the
  coupling rather than resolving it
- **Staging environments, preview-deploy gating, rollback automation** — none has
  a second environment to act on yet
- **`main: dist/index.js`** in `backend/package.json`. Noted in the audit;
  changing it is unrelated to deployment and `npm start` does not read it

---

## Risks

**A rewrite-all rule masks genuine 404s.** Any unmatched path now returns the app
shell with 200, so a mistyped asset URL renders the SPA instead of failing
visibly. This is inherent to client-side routing on a static host. It is why the
not-found route ships in this phase rather than later: without it the rewrite
turns a host 404 into a blank page, which is a regression, not a trade-off.
Accepted with that route in place.

**The smoke test proves boot, not correctness.** It asserts the built entry point
starts and reaches its database. It does not exercise auth, and is not meant to
— the 291 API tests do that against source.

**Deploy hooks do not report success.** A hook returns 202 once the deploy is
queued; the workflow therefore reports "deploy triggered", never "deploy live".
Verifying the deployed revision needs a polled health check against the public
URL, which needs a stable public URL to exist first. Recorded as follow-up
rather than designed on speculation.
