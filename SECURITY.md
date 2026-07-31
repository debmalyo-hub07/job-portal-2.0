# Security

## Reporting a vulnerability

Email the maintainer rather than opening a public issue. Expect an
acknowledgement within 72 hours. Please include reproduction steps and, if you
have one, a suggested fix.

## Current status — read before deploying

Phase 1A hardened the foundation. **It did not fix access control.** Do not run
this against real user data yet.

### Fixed in Phase 1A

- Environment validated at startup; a missing or malformed secret aborts the boot
  instead of leaving `undefined` in a signing call
- 32-character floor on JWT secrets
- Every request gets a response — roughly twenty `catch { console.log(e) }`
  blocks previously logged and returned nothing, hanging the client until timeout
- Internal errors and stack traces no longer reach clients
- CORS restricted to an explicit origin allowlist, rejecting others with 403
- Security headers via helmet; `x-powered-by` removed
- Parameter pollution protection via hpp
- JSON body limit reduced from 16 MB to 1 MB
- Rate limiting, 100 req/min per IP
- `trust proxy` set, so rate limits key on the real client IP behind a proxy
  rather than throttling all users as one
- Cookies, auth headers, passwords, and tokens redacted from logs

### Not yet fixed — known and scheduled

| Defect | Impact | Fixed in |
|---|---|---|
| **No ownership checks on any route** | Any authenticated user can edit any company, read any job's applicants, change any application's status | 1C |
| `httpsOnly` typo instead of `httpOnly` on the login cookie | Session cookie is readable by JavaScript | 1B |
| No `secure` flag on cookies | Cookie can traverse plain HTTP | 1B |
| `role` accepted from the login request body | Client asserts its own role | 1B |
| `User.findOne({ email })` with unsanitized input | NoSQL operator injection, e.g. `{"$ne": null}` | 1B |
| No rate limit on login specifically | Password brute force | 1B |
| `getApplicants` returns unprojected user documents | Leaks bcrypt hashes and full PII to any caller | 1C |
| Resumes on public, guessable Cloudinary URLs | PII (phone, address, employment history) enumerable by anyone | 1C |
| `$regex` search built from raw query input | Unindexable; ReDoS vector | 1C |
| `GET /apply/:id` mutates state | Triggerable by an `<img>` tag on any site | 1C |
| No email verification | Anyone can register any address | 1B |
| No password policy | Single-character passwords accepted | 1B |

## Target authentication design (Phase 1B)

- **Hashing:** Argon2id — 19 MiB memory, 2 iterations, parallelism 1 (OWASP
  baseline). Existing bcrypt hashes are detected by prefix and transparently
  rehashed on next successful login.
- **Access token:** JWT, 15-minute lifetime, `httpOnly` + `secure` + `sameSite`
  cookie.
- **Refresh token:** opaque 32 random bytes, 7-day lifetime, stored SHA-256
  hashed with a family id. Rotated on every use. Presenting an already-spent
  token means theft, so the whole family is revoked and the session ends.
- **CSRF:** double-submit token, since auth rides in cookies.
- **Email verification:** 6-digit OTP via Brevo, hashed at rest, 10-minute TTL,
  5 attempts.
- **Login hardening:** dummy hash comparison when the email does not exist, so
  response timing cannot enumerate registered addresses. Exponential backoff
  lockout from the fifth failure. Uniform failure message regardless of cause.
- **Google OAuth:** authorization-code flow with PKCE, portal bound into the
  `state` parameter, `email_verified` required.

### Account linking rule

When a Google sign-in matches an existing account by email, link **only if**
that account is already email-verified or has no password. If it is unverified
*and* has a password, the account is deleted and recreated from the Google
identity.

This closes a takeover path: an attacker registers `victim@gmail.com` with a
password of their choosing and never verifies it. If the victim later signs in
with real Google and we linked unconditionally, the victim would land in an
account whose password the attacker knows. Since the attacker never proved
control of the mailbox, that credential is discarded rather than honoured.
Deletion rather than credential-clearing is deliberate — an unverified account
may hold attacker-seeded profile data, and nothing of value is lost because an
unverified account has never been able to sign in.

## Rate limits

| Scope | Limit | Status |
|---|---|---|
| Global per IP | 100 / min | Active |
| Login per IP + email | 5 / 15 min | Phase 1B |
| OTP request per email | 3 / hour | Phase 1B |
| Registration per IP | 10 / hour | Phase 1B |

Single-process, in-memory. See
[ADR-0004](docs/adr/0004-no-redis-phase-1.md) — running a second API instance
means an attacker gets 2× every limit above, so Redis becomes mandatory at that
point.

## Credential rotation runbook

Run this if a secret is committed, leaked, or merely suspected. **Rotation is
what stops exposure. Rewriting git history is cleanup, not remediation** — assume
anything ever committed is compromised permanently, since the repository was
cloneable for the life of those commits.

### 1. Rotate every affected credential first

| Credential | Where |
|---|---|
| MongoDB Atlas | Atlas → Database Access → edit user → Edit Password, or delete the user outright |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48`. Invalidates every existing session — expected and desirable, since the old key can forge a token for any user id. |
| `JWT_REFRESH_PEPPER` | `openssl rand -base64 48` |
| Cloudinary | Console → Settings → Access Keys → regenerate |
| Brevo | SMTP & API → API Keys → delete and recreate |
| Google OAuth | Cloud Console → Credentials → Reset secret |

### 2. Purge the file from history

```bash
git bundle create ../backup.bundle --all          # always back up first
pip install git-filter-repo
python -m git_filter_repo --invert-paths --path path/to/.env --force
git remote add origin <url>                       # filter-repo strips it
git push --force-with-lease origin --all
```

### 3. Verify

```bash
git log --all --full-history -- path/to/.env      # must return nothing
git grep -l "<a leaked value>" $(git rev-list --all)   # must return nothing
```

### 4. Afterwards

- Every collaborator must re-clone. A stale clone that pushes reintroduces the
  purged commits.
- On a public repository, GitHub keeps orphaned commits reachable by SHA. Contact
  GitHub Support to request garbage collection of stale refs.
- Restrict the Atlas IP allowlist to known deploy addresses instead of
  `0.0.0.0/0`.
- Delete the backup bundle once verified — it still contains the secret.

### Incident record

**2026-07-31.** `Backend/.env` was committed in the initial commit and removed in
a later one, leaving MongoDB, JWT, and Cloudinary credentials in history. The
repository was private, limiting exposure to accounts with access rather than the
public. Mongo credentials were rotated; history was purged with `git filter-repo`
and force-pushed, also removing 3,262 tracked `node_modules` files and reducing
the repository from 4.5 MB to 292 KB. Verified absent from all remaining commits.

## Practices

- `.env` is gitignored; only `.env.example` is tracked, with names and no values
- Secrets require 32+ characters, enforced at startup
- Dependencies are audited in CI by `scripts/audit-prod.mjs`, which checks
  **production dependencies only** and fails on any high or critical advisory
  that is not explicitly allowlisted
- Dev-only advisories are excluded deliberately: a DoS in a linter's transitive
  glob parser cannot be reached by a user, and treating it as a build failure
  produces a permanently red check that trains everyone to ignore CI
- No secret is ever logged — redaction is enforced in the Pino config

## Allowlisted advisories

Each entry in `scripts/audit-prod.mjs` records why the advisory is suppressed
and what would make it relevant again. Adding one deserves the same scrutiny as
any other security decision.

| Advisory | Package | Why suppressed |
|---|---|---|
| [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | `react-router` | RSC Mode CSRF bypass. This app is a plain Vite SPA with no React Server Components, so the vulnerable path is absent from the bundle. The advisory range (7.12.0–8.2.0) extends past 7.18.2, the latest published release — there is no patched version to move to. Re-check when react-router publishes outside the range, or if this app adopts RSC. |
