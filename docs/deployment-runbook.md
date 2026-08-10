# First deployment runbook

Step-by-step for the first deploy to Render (API) and Vercel (web). Read
[ADR-0007](adr/0007-deploy-topology.md) for *why* the topology is what it is;
this file is the *how*, in the order the dependencies force.

The order is the hard part. Three values are circular — the API needs the web
URL, the web needs the API URL, and Google needs the API URL — and two settings
are silently destructive if left at their defaults.

## 0. Before either dashboard

You need working credentials for **MongoDB Atlas**, **Cloudinary**, **Brevo**
and **Google OAuth**. The API refuses to boot without them and names each one
it is missing, so a missing value is a named boot failure rather than a mystery.

### Give production its own database

`MONGO_URI` must include a database name in the path:

```
mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/jobportal
                                                 ^^^^^^^^^^
```

Without it Mongoose silently connects to one called `test`. That is not
hypothetical — the development URI in this project has no database name, so all
local data lives in `test` on the shared cluster. A production URI written the
same way would land in the *same* database: same collections, same accounts,
same OTP rows, with nothing to indicate the two environments were merged.

### Atlas network access

Render's free plan has no static outbound IP, so Atlas must allow `0.0.0.0/0`
under Network Access. Keep the database user scoped to this one database — the
open allowlist means the password is the only thing standing in front of it.

### Brevo will reject the first sends

Brevo enforces an IP allowlist and Render's egress IP is not on it. Until it is,
every mail call 401s **while registration still returns 201** — so signup
dead-ends with no email and no error. Deploy first, send one test registration,
then add the IP Brevo reports. This also blocks admin seeding (step 6).

### Generate four fresh secrets

Each is validated at `min(32)` and all four must differ; the API refuses to boot
otherwise. Do not reuse the development values.

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_PEPPER
openssl rand -base64 48   # OTP_PEPPER
openssl rand -base64 48   # CSRF_SECRET
```

## 1. Render — the API

**New → Blueprint**, not "New Web Service". Render reads
[`render.yaml`](../render.yaml) from the repository root and creates
`jobportal-api` with the build command, start command, health check and
instance count already set.

It then prompts for every variable marked `sync: false`. That is deliberate: a
fresh deploy stops and asks rather than starting with blanks.

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas → Connect → Drivers, **with a database name** |
| `JWT_ACCESS_SECRET` | the four generated above, all different |
| `JWT_REFRESH_PEPPER` | |
| `OTP_PEPPER` | |
| `CSRF_SECRET` | |
| `API_BASE_URL` | the Render URL, no trailing slash |
| `WEB_BASE_URL` | **placeholder** — corrected in step 3 |
| `CLIENT_URLS` | **placeholder** — corrected in step 3 |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Cloudinary → Dashboard → Product Environment Credentials |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` | Brevo → SMTP & API → API Keys; sender must be verified |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the OAuth client from step 4 |

Deploy, and note the assigned URL (`https://jobportal-api.onrender.com`).

### Two settings not to touch

`NODE_ENV=production` and `COOKIE_SAMESITE=none` are pinned literals in the
blueprint. `numInstances: 1` and `autoDeploy: false` are equally load-bearing:

- **`numInstances` is a security parameter.** `rateLimitStore.ts` is a
  single-process `Map` (ADR-0004), so every threshold is per-instance. Two
  instances turn `LOGIN_LOCK_THRESHOLD` 5 into ~10 and `OTP_BUDGET_MAX_FAILURES`
  20 into ~40. The dashboard shows it as a number field beside the plan
  selector, with nothing connecting it to brute-force resistance.
- **`autoDeploy: false` is what makes CI the gate.** On, Render deploys while
  the suite is still running, so the revision users get is the one the host
  picked rather than the one the workflow approved.

## 2. Vercel — the web app

1. **Add New → Project**, import the same repository.
2. **Root Directory → `frontend`.** Without it Vercel builds the workspace root
   and finds no app.
3. Framework preset auto-detects as **Vite**; build command and `dist` output
   are correct by default.
4. Add `VITE_API_URL` = `https://jobportal-api.onrender.com/api/v1` — the
   Render URL **including the `/api/v1` suffix**. Apply to Production, Preview
   and Development.
5. Deploy; note the `https://<project>.vercel.app` URL.
6. **Settings → Git → turn off automatic production deployments.**

### Why `VITE_API_URL` cannot be skipped

It is a **build-time** requirement, not only a runtime one. The value is inlined
as a literal, so with it unset Rolldown proves `apiClient.ts`'s import-time
throw always fires, treats everything downstream as unreachable, and
tree-shakes the entire application away: a valid **275 kB** bundle against a
real **874 kB**, correct hashed filename, zero routes, exit code 0 — and a blank
white page with a clean console.

`vite.config.js` now refuses that build, so a missing variable is a loud error
naming the variable, and `cd.yml` greps the built bundle for route literals
because the old check (a hashed chunk name in `index.html`) is one the hollow
bundle passes.

### Auto-deploy must be turned off by hand

Render's is handled by `autoDeploy: false` in the committed blueprint. Vercel's
equivalent is a **project setting the repository cannot reach**, so it is the
one prerequisite with no file backing it up.

## 3. Close the URL loop

Return to Render → Environment and replace the placeholders:

| Variable | Set to |
|---|---|
| `WEB_BASE_URL` | `https://<project>.vercel.app` — where auth redirects land |
| `CLIENT_URLS` | `https://<project>.vercel.app` — the CORS allowlist |

Save and redeploy. Until this is right, sign-in redirects go to the wrong host
and every browser request is blocked by CORS.

## 4. Google OAuth redirect URIs

Google Cloud Console → APIs & Services → Credentials → the Web application
client → **Authorised redirect URIs**. Add exactly these two — they are matched
byte-for-byte, so a trailing slash is a different URI:

```
https://jobportal-api.onrender.com/api/v1/seeker/auth/google/callback
https://jobportal-api.onrender.com/api/v1/recruiter/auth/google/callback
```

Leave **Authorised JavaScript origins** empty: this is a server-side PKCE flow
and the browser never calls Google directly. There is deliberately no admin
callback — the admin portal mounts no Google routes.

## 5. Deploy hooks

1. Render → service → Settings → **Deploy Hook**; copy the URL.
2. Vercel → Settings → Git → **Deploy Hooks**; create one for `main`, copy it.
3. GitHub → Settings → Secrets and variables → Actions → **New repository
   secret**: `RENDER_DEPLOY_HOOK_URL` and `VERCEL_DEPLOY_HOOK_URL`.

Hooks rather than CLI tokens: a hook is scoped to one project and branch, while
a `VERCEL_TOKEN` acts on the whole account, so a leak is an account compromise
instead of one unwanted deploy. Until the secrets exist both steps skip with a
`::notice::` and the run stays green — designed behaviour, and what run 35 did.

## 6. Seed the first admin

There is no admin self-registration anywhere: the admin auth router mounts no
`/register`, and the client mounts no `/admin/signup` — a typed URL must not
reach a form that cannot post. The first admin is seeded against the production
database:

```bash
# backend/.env pointed at the PRODUCTION MONGO_URI
npm run seed:admin --workspace @jobportal/api -- \
  --email you@example.com --name "Your Name"
```

No password is accepted as an argument — it would land in shell history and
process listings. The account is created pre-verified with `passwordHash: null`
and a set-password code is **emailed**, which is why Brevo has to work first. If
the mail never arrives, use forgot-password on the admin login to reissue.
Re-running is safe: it refuses when an admin exists unless `--force`.

## 7. Verify

Four checks, in this order — each isolates a different layer.

1. **API health.** `https://jobportal-api.onrender.com/health` must report
   `status: ok` **and** `db: connected`. Status alone passes with a dead
   database.
2. **The bundle is real.** Load the Vercel URL. A blank page with a clean
   console means `VITE_API_URL` was missing at build time — check Vercel's build
   log for the guard's error.
3. **Deep links.** *Type* `/jobs`, `/hire/login` and a wrong path like
   `/nonsense` into the address bar. In-app navigation cannot test this: that is
   `history.pushState` and never reaches the host. `/nonsense` should render the
   not-found page, not a blank screen.
4. **A real session.** Register a seeker, receive the OTP, verify, and confirm
   you are still signed in after a reload. Sign-in succeeding but the next
   request arriving anonymous means `COOKIE_SAMESITE` is not `none`.

Render's free plan sleeps after inactivity: the first request after an idle
period takes 30–60 seconds and looks like a hang. That is not a fault.

## Condensed order

1. Atlas allows `0.0.0.0/0`, and the production URI names its own database
2. Render blueprint deploy → gives the API URL
3. Vercel project → root `frontend`, `VITE_API_URL` ending in `/api/v1`
4. Back to Render → fix `WEB_BASE_URL` and `CLIENT_URLS`
5. Google redirect URIs, both portals, no JS origins
6. Auto-deploy off in Vercel
7. Both deploy hooks into GitHub secrets
8. Brevo IP allowlist, after the first failed send
9. Seed the admin, once mail works

## What a green deploy does not prove

A deploy hook answers `202` once the deploy is *queued* and says nothing about
whether it succeeded, so a green `cd.yml` means both hosts accepted the request.
Step 7 is the verification; polling each host's API for deploy status would
need the account-scoped tokens the hook design deliberately avoids.
