# First deployment runbook

Step-by-step for the first deploy to Render (API) and Vercel (web). Read
[ADR-0007](adr/0007-deploy-topology.md) for *why* the topology is what it is;
this file is the *how*, in the order the dependencies force.

The order is the hard part. Three values are circular — the API needs the web
URL, the web needs the API URL, and Google needs the API URL — and two settings
are silently destructive if left at their defaults.

## 0. Before either dashboard

You need working credentials for **MongoDB Atlas**, **Cloudinary**, **Brevo**,
**Google OAuth**, and **Cloudflare Turnstile**. The API refuses to boot without
its required production configuration and names each missing value, so a missing
setting is a named boot failure rather than a mystery.

### Give production its own database

`MONGO_URI` must include a database name in the path:

```
mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/jobportal
                                                 ^^^^^^^^^^
```

Without it Mongoose connects to one called `test`. Production now refuses to
boot when the path has no database name, and every successful connection logs
the selected database. Development still permits the fallback for existing
local environments, but emits a warning so local and deployed accounts cannot
be mistaken for one another silently.

Name the development database too — `jobportal_dev` — in `backend/.env`. The
cluster may be shared; the database must not be. Atlas's Connect dialog hands
out a path-less URI, so the natural result of following it on a laptop is a
local API writing to `test` **on the production cluster**, one typo away from
writing to production itself. Nothing in the app can tell the two apart: the
seeds, the sweeper, and every local experiment write for real. Two databases
also mean the `--confirm-database` guard on the seeds has something to catch.

Seed the development database to match production's catalog:

```bash
npm run seed:catalog --workspace @jobportal/api -- --confirm-database jobportal_dev
```

That is 3 companies and 6 jobs. Do not copy production's accounts — the admin,
seekers, applications and refresh tokens there belong to real people.

### Atlas network access

Render's free plan has no static outbound IP, so Atlas must allow `0.0.0.0/0`
under Network Access. Keep the database user scoped to this one database — the
open allowlist means the password is the only thing standing in front of it.

### Atlas data protection

Do not create or use a browser-facing database key. The API alone holds
`MONGO_URI`; the browser talks only to the API. MongoDB has no SQL-style
row-level-security setting, so the application enforces record ownership in its
service queries and Atlas must enforce least privilege underneath it.

Before storing real data, verify in Atlas that TLS is required, encryption at
rest and encrypted backups are enabled for the chosen tier, and the database
user has access only to this application's database. Those are provider settings
that the code cannot enable or inspect.

### Brevo API IP blocking and Render

Brevo automatically activates unknown-IP blocking after its API-key learning
phase. Render does not give this service one permanent outbound address, so a
later send can leave through a different address and Brevo will reject it with
401 until somebody approves that address. Repeatedly approving notifications is
not a stable deployment configuration.

For this Render topology, deactivate blocking for **API keys** in Brevo:

1. Account menu → **Settings** → **Security** → **Authorized IPs**
2. Under **Blocking unauthorized IP addresses**, find **API keys**
3. Click **Deactivate for API**, then **Deactivate blocking**

Brevo documents the same control in
<https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security>.

The application uses the Brevo API, not an SMTP key, so the SMTP row is unrelated.
This is a Brevo dashboard control; their public API does not expose it. Keep the
API key only in Render, rotate it after any exposure, and use the startup check
below. If source-IP filtering is mandatory, the alternative is a static-egress
gateway or hosting plan, not approving Render addresses one at a time.

Diagnose the key and sender without sending anything from a local terminal or
Render shell:

```bash
npm run check:mail
```

A 401 naming an unrecognised IP means API-key IP blocking is still active.

The server verifies the API key and sender at startup. A failed readiness check
or transactional send opens a mail circuit for one minute. Registration,
verification-code resend, password recovery, and admin provisioning then return
`503 EMAIL_UNAVAILABLE` before writing an account or OTP. The first request that
races with a newly failing provider can still have been accepted before the
asynchronous send rejects; that rejection opens the circuit for later requests.
After one minute, the next code request checks Brevo again and closes the circuit
automatically when the provider has recovered.

Actual delivery remains asynchronous so password recovery does not reveal
whether an address exists through provider latency. Accepted messages are logged
by provider message id, and provider failures are reduced to safe status fields
that cannot contain credentials, recipient addresses, or OTP content.

### Generate five fresh secrets

Each is validated at `min(32)` and all five must differ; the API refuses to boot
otherwise. Do not reuse the development values.

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_PEPPER
openssl rand -base64 48   # OTP_PEPPER
openssl rand -base64 48   # CSRF_SECRET
openssl rand -base64 48   # ADMIN_PROVISIONING_SECRET
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
| `JWT_ACCESS_SECRET` | the five generated above, all different |
| `JWT_REFRESH_PEPPER` | |
| `OTP_PEPPER` | |
| `CSRF_SECRET` | |
| `ADMIN_PROVISIONING_SECRET` | Private second factor for an existing admin to invite another admin |
| `API_BASE_URL` | the Render URL, no trailing slash |
| `WEB_BASE_URL` | **placeholder** — corrected in step 3 |
| `CLIENT_URLS` | **placeholder** — corrected in step 3 |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Cloudinary → Dashboard → Product Environment Credentials |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` | Brevo → SMTP & API → API Keys; sender must be verified |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the OAuth client from step 4 |
| `TURNSTILE_SECRET_KEY` | Server secret for the production Cloudflare Turnstile widget |

Deploy, and note the assigned URL (`https://jobportal-api.onrender.com`).

### Two settings not to touch

`NODE_ENV=production` and `COOKIE_SAMESITE=none` are pinned literals in the
blueprint. `numInstances: 1` is equally load-bearing:

- **`numInstances` is a security parameter.** `rateLimitStore.ts` is a
  single-process `Map` (ADR-0004), so every threshold is per-instance. Two
  instances turn `LOGIN_LOCK_THRESHOLD` 5 into ~10 and `OTP_BUDGET_MAX_FAILURES`
  20 into ~40. The dashboard shows it as a number field beside the plan
  selector, with nothing connecting it to brute-force resistance.

`autoDeploy: true` (changed 2026-08-11) is a deliberate operating decision, not
a default left in place. Both hosts now deploy on push. See "What auto-deploy
costs" below.

## 2. Vercel — the web app

1. **Add New → Project**, import the same repository.
2. **Root Directory → `frontend`.** Without it Vercel builds the workspace root
   and finds no app.
3. Framework preset auto-detects as **Vite**; build command and `dist` output
   are correct by default.
4. Add `VITE_API_URL` = `https://jobportal-api.onrender.com/api/v1` — the
   Render URL **including the `/api/v1` suffix**. Apply to Production, Preview
   and Development.
5. Create a Cloudflare Turnstile widget for the Vercel hostname and add its
   **public site key** as `VITE_TURNSTILE_SITE_KEY` for Production, Preview, and
   Development. The build intentionally refuses to run without it. Keep the
   matching **secret key** only in Render as `TURNSTILE_SECRET_KEY`.
6. Deploy; note the `https://<project>.vercel.app` URL. Automatic production
   deployments stay **on**, matching `autoDeploy: true` on Render.

### Why the public build variables cannot be skipped

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

`VITE_TURNSTILE_SITE_KEY` is deliberately public and is safe to include in the
bundle. It identifies a Turnstile widget; it does not verify challenges. The
matching `TURNSTILE_SECRET_KEY` stays on the API and production requests fail
closed if it is absent or verification fails.

### What auto-deploy costs

Both hosts deploy on push. Nothing gates a deploy on the suite passing, so a
push that breaks CI still reaches users — the revision they get is the one the
host picked, not the one the workflow approved. CI still runs, and still tells
you; it just tells you in parallel with the deploy rather than before it.

That trade was accepted on 2026-08-11, after the original design turned out to
be half-built: `autoDeploy: false` shipped, but the `RENDER_DEPLOY_HOOK_URL`
secret it depended on never did, so `cd.yml` skipped its deploy step with a
`::notice::` on every run and every deploy was manual. The gate was not gating —
it was only blocking.

To restore CI-as-gate, both halves have to be present at once:

1. Add `RENDER_DEPLOY_HOOK_URL` and `VERCEL_DEPLOY_HOOK_URL` under Settings →
   Secrets and variables → Actions.
2. Set `autoDeploy: false` in `render.yaml` and turn off automatic production
   deployments in Vercel → Settings → Git.

Order matters. Step 2 first is the state this repository was just in: no
automatic deploys at all.

## 3. Close the URL loop

Return to Render → Environment and replace the placeholders:

| Variable | Set to |
|---|---|
| `WEB_BASE_URL` | `https://<project>.vercel.app` — where auth redirects land |
| `CLIENT_URLS` | `https://<project>.vercel.app` — the CORS allowlist |

Save and redeploy. Until this is right, sign-in redirects go to the wrong host
and every browser request is blocked by CORS.

### Cross-site means `document.cookie` is empty

Vercel and Render are different registrable domains, so the browser treats every
API call as cross-site. `COOKIE_SAMESITE=none` handles whether cookies are
*sent*. It does not make them *readable*.

`__Host-jp_<portal>_csrf` is set `httpOnly: false` precisely so the client can echo it in
`X-CSRF-Token` — and cross-site the browser withholds it from `document.cookie`
anyway. Partitioning, not `httpOnly`. Measured against production:

```
cookies stored by browser: __Host-jp_admin_at, __Host-jp_admin_rt, __Host-jp_admin_csrf
document.cookie (JS-visible): (EMPTY)
```

So the token travels in the **response body** of `/login`, `/verify-email`,
`/refresh` and `/me`, and `apiClient.ts` keeps it in memory. Do not "simplify"
that back to a cookie read — it works in local development, where the API is
same-origin, and fails only in production, only on writes.

The failure is worth recognising because it does not look like a CSRF problem.
Reads keep working for `ACCESS_TOKEN_TTL_MINUTES` (15). Then `/refresh` — a POST
— answers 403, and `apiClient` only recovers 401s, so the session dies with no
route back. It reads as "the session expires on its own"; in fact every write in
the application is failing the same way.

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

Later admins are invited from the signed-in admin dashboard. Keep
`ADMIN_PROVISIONING_SECRET` in Render only; do not add it to Vercel or any
`VITE_*` variable. The inviter types the matching value into the invite form,
the API compares it in constant time, and logs redact the submitted field. The
route also requires an admin-signed session, admin CSRF, a 5/hour rate limit,
and working transactional email.

### Optional: seed an empty marketplace

After the Vercel deployment containing the demo company marks is live, an empty
jobs database can be populated from a Render shell:

```bash
npm run seed:catalog --workspace @jobportal/api -- --confirm-database jobportal
```

Use the exact database name from `MONGO_URI`. The script creates only labelled
demo companies and jobs under a recruiter with no login identity. It is safe to
re-run, and it stops if any non-demo job already exists unless the operator adds
`--allow-nonempty` intentionally.

## 7. Verify

Four checks, in this order — each isolates a different layer.

1. **API health.** `https://jobportal-api.onrender.com/health` must report
   `status: ok` **and** `db: connected`. Status alone passes with a dead
   database.
2. **The bundle is real.** Load the Vercel URL. A blank page with a clean
   console means `VITE_API_URL` was missing at build time — check Vercel's build
   log for the guard's error.
3. **Deep links.** *Type* `/jobs`, `/hire`, `/admin` and a wrong path like
   `/nonsense` into the address bar. In-app navigation cannot test this: that is
   `history.pushState` and never reaches the host. Anonymous `/hire` and `/admin`
   must land on their matching login pages; `/nonsense` should render the
   not-found page, not a blank screen.
4. **A real session.** Complete the Turnstile challenge, register a seeker,
   receive the OTP, verify, and confirm you are still signed in after a reload.
   A missing widget usually means `VITE_TURNSTILE_SITE_KEY` was not present at
   build time or the deployed hostname is absent from the Turnstile widget.
   Sign-in succeeding but the next request arriving anonymous means
   `COOKIE_SAMESITE` is not `none`.
5. **Portal isolation.** Sign into seeker and recruiter in the same browser.
   Both sessions must survive reloads. Typing an admin workspace URL must show
   admin login rather than either existing workspace, and signing out of one
   portal must leave the other session intact.

Render's free plan sleeps after inactivity: the first request after an idle
period takes 30–60 seconds and looks like a hang. That is not a fault.

## Condensed order

1. Atlas allows `0.0.0.0/0`, and the production URI names its own database
2. Render blueprint deploy → gives the API URL
3. Create the Turnstile widget for the Vercel hostname; put the public site key
   in Vercel and the matching server secret in Render
4. Vercel project → root `frontend`, `VITE_API_URL` ending in `/api/v1`
5. Back to Render → fix `WEB_BASE_URL` and `CLIENT_URLS`
6. Google redirect URIs, both portals, no JS origins
7. Auto-deploy on in both hosts (the default; `autoDeploy: true` in
   `render.yaml`, Vercel's left at its default)
8. Optionally, both deploy hooks into GitHub secrets — only needed if
   CI-as-gate is restored later; with auto-deploy on, `cd.yml`'s deploy steps
   skip with a `::notice::` and deploys happen without them
9. Brevo API unknown-IP blocking deactivated; `npm run check:mail` passes
10. Seed the admin, once mail works

## What a green deploy does not prove

A deploy hook answers `202` once the deploy is *queued* and says nothing about
whether it succeeded, so a green `cd.yml` means both hosts accepted the request.
(Polling each host's API for deploy status would need the account-scoped tokens
the hook design deliberately avoids.) With auto-deploy on, `cd.yml` no longer
queues deploys at all — it is an artifact check only, and a green run means the
artifacts were sound, not that anything was deployed.

Nor does a green suite prove the app works cross-site. Three bugs so far reached
production through a fully green local run — a missing `VITE_API_URL`
tree-shaking the bundle, `NODE_ENV=production` omitting the devDependencies
`tsc` needs, and the CSRF cookie being unreadable across sites. Each was
invisible locally *by construction*: `.env.local` exists on every dev machine,
CI installed with a bare `npm ci`, and localhost is same-origin. **Verify a
write, not just a read** — sign in, then approve or post something.
