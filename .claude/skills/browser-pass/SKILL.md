---
name: browser-pass
description: Launch this app locally and verify features in a real browser — dev servers, seeded dev accounts, Playwright driving, screenshots, geometry checks. Use this skill whenever the user asks to run the app, start or check the dev servers, see a change working outside the test suite, take screenshots of a screen, drive a flow as a seeker/recruiter/admin, click through a feature locally, or confirm UI work is visually done. The jsdom suite cannot see blank pages, broken layouts, or a chart that drew nothing — this skill is how those get caught before a claim of "works".
---

# Browser pass — verify features in the real app

The suites prove logic; they cannot prove the app boots, lays out, or draws.
This repo's own history is full of exactly that gap (import-time throws that
pass every test, route guards jsdom can't follow, a flat chart that renders
an honest-looking nothing). A browser pass is the only check that closes it.

The whole pass has five stages: **servers → accounts/data → drive → verify
what you see → clean up**. Each stage has one trap that has already cost a
session real time; they are called out below.

## 1. Servers

Check for stale servers FIRST — an orphaned node still owning a port will
answer requests and look like your code (Vite is `strictPort`, so a held 5173
fails the new server loudly; a held 8000 answers silently):

```bash
netstat -ano | grep -E ":(5173|8000)" | grep LISTEN
# If owned by orphans: taskkill //PID <pid> //F   (there is no pkill here)
```

Start both from the repo root, detached, logs to scratch files:

```bash
npm run dev:api > .scratch-api.log 2>&1 &   # Express on :8000
npm run dev:web > .scratch-web.log 2>&1 &   # Vite on :5173, strictPort
```

Wait for readiness by asking, not sleeping:

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health | grep -q 200; do sleep 1; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q 200; do sleep 1; done
```

The web dev server reaches the API directly via `VITE_API_URL` in
`frontend/.env.local` (`http://localhost:8000/api/v1`). If that file is
missing, the Vite build plugin fails the server on purpose — a missing
`VITE_API_URL` tree-shakes the app into a hollow bundle that still serves.

## 2. Accounts and data

**The dev database is `jobportal_dev` on the SAME Atlas cluster as prod.** The
database name is the only thing separating them. Never write a seed script
without a name guard that refuses to run anywhere else:

```ts
const db = mongoDatabaseName(config.MONGO_URI) ?? "test";
if (db !== "jobportal_dev") { console.error(`refusing: ${db}`); process.exit(1); }
```

Existing local accounts (password for all: `correct horse battery staple`):

| Account | Portal | Notes |
|---|---|---|
| `dev.seeker@example.test` | seeker | verified, profile complete |
| `dev.recruiter@example.test` | recruiter | active, owns a company |
| `dev.admin@example.test` | admin | created 2026-08-31 |

Local login needs no CAPTCHA (the Turnstile keys in `backend/.env` are
commented out) and the limit is 5 attempts / 15 min — a backend restart
clears it. Do NOT create fresh accounts through the signup UI: OTP mail goes
through real Brevo, which 401s on an unrecognised dev IP and dead-ends the
signup invisibly. Use the accounts above.

If a dev account's password is unknown, reset it with the app's own hashing —
scratch TS in `backend/src/scripts/` (the depth matters: `../config/env.js`
resolves correctly only from there), run with `npx tsx`, delete after:

```ts
import { hashPassword } from "../lib/password.js";
const hash = await hashPassword("correct horse battery staple");
await Seeker.updateOne({ email: "dev.seeker@example.test" }, { $set: { passwordHash: hash } });
```

Seed pattern for whatever the feature needs (idempotent, app's own models,
history entries coherent, `createdAt` set at creation because timestamps make
it immutable):

- bootstrap like `backend/src/scripts/seed-demo-catalog.ts` does:
  `await import("dotenv/config")`, `env()`, the name guard,
  `mongoose.connect`, work, `disconnect`;
- probe what exists first with a counts-only script (never print URIs);
- `Application.init()` / `SavedJob.init()` before first duplicate insert, or
  the unique autoIndex races the test of it.

## 3. Driving

Playwright lives in the repo root's `node_modules` — a driver script must
live at the repo root too (a script in a temp dir cannot resolve `playwright`;
nor can one inside `backend/`/`frontend/` without care). `import { chromium }
from "playwright"` from root.

- **One fresh context per portal.** Never share storageState across contexts —
  the three portals' cookies deliberately collide and a reused context logs
  the wrong portal out.
- **Login selectors are `#email` and `#password`.** `getByLabel("Password")`
  matches the password-reveal button too ("Show password" contains it) and
  strict mode fails on the pair.
- **Never `waitForLoadState("networkidle")`** — on a cold Vite server it
  settles before React fetches, so a working feature reads as broken. Wait
  for the value: `locator.waitFor()`, `textContent()` containing the thing.
- ProtectedRoute renders `null` while bootstrapping — same rule: wait for
  data, not navigation events.
- Screenshots go to an absolute Windows path (`C:/Users/.../shots/`); Git
  Bash `/tmp` is not Node's `/tmp`.
- First visit to a route pays Vite's transform — generous timeouts on
  `goto`, `domcontentloaded` not `load`.

Login helper that has worked verbatim:

```ts
async function login(page, path, email) {
  await page.goto(`http://localhost:5173${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
}
```

Login paths: `/login` (seeker), `/hire/login` (recruiter), `/admin/login`
(admin).

## 4. Verifying what you see

Screenshots are only evidence if someone looks at them. If `Read` on a PNG
returns a CDN link instead of showing the image, you cannot see it — do not
claim you did. Fall back to checks that need no eyes:

- **Geometry, in-page**: `getBoundingClientRect()` on the elements that
  matter — the chart's `path[data-mark='line']` has a non-zero box and a long
  `d` attribute, block A sits beside block B, the table has height. This is
  stronger than a screenshot anyway: it measures.
- **PNG size as a blank-detector**: a rendered page is tens of KB; a blank
  frame compresses to almost nothing.
- Assert exact user-visible strings in the DOM (toasts, badges, row states) —
  the same assertions the jsdom suite makes, but against the real server.

## 5. Cleanup

- Delete every scratch script and log (`.scratch-*.log`, `*.temp.ts` in
  `backend/src/scripts/`, driver `.temp.mjs` at root). `git status --short`
  must come back empty before you report done.
- Stop the servers, or leave them running and SAY SO with the ports — an
  unreported running server is next session's stale-server trap.
- Seeded dev data is disposable; note what was left in `jobportal_dev` so the
  next pass knows what it will find.

## What a complete pass looks like

The reference execution (2026-09-02, saved-jobs + bulk-move phases): seeded
two jobs and a mixed application set onto the dev recruiter's company; as the
seeker, saved both roles and saw them in `/saved`; as the recruiter, saw the
posting-health chart draw beside the funnel, selected all four applicants,
bulk-moved to Shortlisted and read the honest toast naming moved and skipped
with reasons; deleted one role; back as the seeker, saw the dead row marked
"No longer available". Every step asserted in the DOM, layout asserted by
geometry, cleanup verified by `git status`.
