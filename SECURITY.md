# Security

## Reporting a vulnerability

Email the maintainer rather than opening a public issue. Expect an
acknowledgement within 72 hours. Please include reproduction steps and, if you
have one, a suggested fix.

## Current status — read before deploying

Phase 1A hardened the foundation, Phase 1B replaced authentication,
**Phase 1C closed authorization**, and **Phase 3A closed recruiter
self-provisioning**. Portal *scoping* (a seeker cannot reach a recruiter route)
is backed by ownership: every route touching a user-owned resource resolves it by
a predicate that includes the caller, and a resource you do not own is
indistinguishable from one that does not exist.

Until 3A, ownership was the *only* gate on the recruiter surface — and anyone
could become a recruiter by filling in a form. The checks worked as designed;
the flaw was that the caller they authorised was self-appointed. Recruiter
accounts now start `pending` and an admin approves them.

Portal session isolation is now complete in the browser as well. `/admin` is a
protected session door, the recruiter workspace under `/hire/*` is gated on a
recruiter session and on admin approval, wrong-role sessions are sent to the
destination portal's login, and seeker, recruiter, and admin cookies can coexist
without overwriting one another. `/hire` itself is a public marketing page and
was never a boundary — it reads no workspace data. These client guards prevent accidental UI
exposure; the actual boundary remains server-side portal authentication and
ownership checks. The admin URL is not secret and does not need to be hidden or
encrypted to be secure.

The remaining known issues are in [Not yet
fixed](#not-yet-fixed--known-and-scheduled) below. None is an access-control
defect; the open items are a performance ceiling on search and an orphaned
Cloudinary asset on logo replacement. Read them before pointing this at real
user data.

Phases 2A and 2B-1 were frontend work and changed no security boundary. The one
adjacent change: the client no longer holds a portal in component state or
offers a control to pick one — it is derived from the route, the same rule the
API applies.

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

### Fixed in Phase 1B

- `httpsOnly` typo instead of `httpOnly` on the login cookie — the session
  cookie was readable by JavaScript, because `httpsOnly` is not a real option
  and Express silently ignored it
- No `secure` flag on cookies; session cookies could traverse plain HTTP
- **Logout did not clear the cookie in production.** The clear used different
  attributes than the set, so the browser kept the original — signing out left
  the session live. Never listed in the table below; found while rebuilding it
- `role` accepted from the login request body — the client asserted its own
  role. There is no role field left to assert: the collection *is* the role
- `User.findOne({ email })` with unsanitized input, open to operator injection
  such as `{"$ne": null}`
- No rate limit on login specifically, so passwords could be brute forced
- No email verification; anyone could register any address
- No password policy; single-character passwords were accepted
- **`getApplicants` leaked password hashes.** `passwordHash` is now
  `select: false`, so the field cannot reach a response without an explicit
  opt-in at the service boundary. The endpoint is still not a DTO — see below
- **The public job endpoint leaked applicant lists.** `GET /job/get/:id`
  populated the job's entire `applications` array so the client could decide
  whether to show "Already Applied". Fixed when the job board was made public,
  which is what made it reachable without a session; the client now asks the
  seeker-scoped `/application/get` about its own applications instead

### Fixed in Phase 1C

| Defect | How it is closed |
|---|---|
| **No ownership checks on any route** | Every route touching a user-owned resource resolves it by a predicate that includes the caller (`{ _id, userId }`), in the service layer. Missing and foreign are indistinguishable: both 404, same code and message. Applications reach their owner transitively (application → job → `created_by`) |
| `getApplicants` returns an unprojected document | Returns `ApplicantDto` — name, email, phone, headline, skills, resume link, status, applied-at. The populate is projected at the query, so nothing else is even loaded |
| Resumes on public, guessable Cloudinary URLs | Uploaded as `authenticated` raw assets; the DB stores the `public_id`; each read mints a ~10-minute signed URL. Pre-1C rows holding a full URL still resolve, and are the only remaining public links |
| `$regex` search built from raw query input | Input is escaped before it reaches a `RegExp`, and the filter is a `RegExp` value inside `mongoose.trusted`. Still an unindexed scan — a `$text` index is a Phase 3 decision |
| `GET /apply/:id` mutates state | Now `POST /application/apply/:id`. Duplicate applies are rejected by a unique `{job, applicant}` index rather than a read-then-write, so two parallel applies cannot both succeed |

Also in 1C: `sanitizeFilter` on globally, `bridgeAuth`/`req.id` deleted, upload
size and MIME limits, Zod validation on every domain input, pagination on every
list endpoint, and the legacy `users` collection dropped.

### Fixed in Phase 3A

| Defect | How it is closed |
|---|---|
| **Anyone could self-register as a recruiter** and immediately post jobs, edit companies and read applicant PII — name, email, phone and a signed resume link for every applicant to a job they invented | Recruiter registration now lands `pending`. `requireApproved` gates every recruiter-owned mutation (job posting, both company mutations, both applicant routes) with 403 `RECRUITER_PENDING_APPROVAL` until an admin approves the account |
| **Google sign-in self-provisioned a recruiter**, routing around registration entirely | The stranger branch is portal-aware: Google may sign in an existing recruiter but never create one. A recruiter account can only begin at `/recruiter/auth/register`, and therefore only as `pending` |

`requireApproved` re-reads the account rather than trusting a claim in the access
token: approval happens while the recruiter is signed in, and a status baked into
a 15-minute token would either lock them out for its remaining life or leave a
revoked recruiter working until it expired.

It answers **403, not 404** — the one deliberate exception to the ownership rule.
That rule hides whether a resource exists from a caller who does not own it; this
refusal is about the caller's own account state and reveals nothing about any
resource.

Admin is a third account collection with no self-service registration path at
all: the admin router mounts no `/register` and no `/google`. The first admin
comes from `npm run seed:admin`, and later ones from an existing admin.
`authenticateAny` and `optionalAuthenticate` deliberately exclude admin, so an
admin cookie can never satisfy a domain route that meant "some signed-in user".

There is no hardcoded production admin credential. `seed:admin` accepts the
first admin's email and name at runtime, accepts no password, and mails a
short-lived password setup code. Later admin invitations require an existing
admin-signed session, admin-scoped CSRF, a 5/hour rate limit, mail readiness,
strict input validation, and a timing-safe comparison against
`ADMIN_PROVISIONING_SECRET`. That secret belongs only in the API environment,
never in Vercel or a `VITE_*` variable; the presented field is redacted from
logs.

The setup email links to `/admin/set-password` and carries the invited address so
the form can prefill it. It carries **no code**. A link that authenticated on
click would be a bearer credential for the highest-privilege portal travelling
through mail scanners, referrer headers, forwarded threads and browser history —
none of which a typed six-digit code is exposed to. The link is navigation; the
credential is still the code, still short-lived, still rate-limited, and still
subject to the per-account OTP failure budget.

### Fixed in the portal session isolation pass

- Access, refresh, and CSRF cookies are all named per portal. Signing into or
  out of one portal cannot replace another portal's cookie or CSRF state.
- The frontend stores one cached user, bootstrap flag, in-memory CSRF token, and
  refresh promise per portal. Every protected route verifies its own portal via
  `/me` before rendering.
- Public job browsing remains available. An anonymous Apply action navigates to
  seeker login with a validated return path; `POST /application/apply/:id`
  independently requires a seeker-signed session.

### Fixed in the security hardening pass

- Production startup requires HTTPS base URLs and a server-only Cloudflare
  Turnstile secret; plaintext requests receive `426 HTTPS_REQUIRED` and HSTS is
  enabled at the API and web edges.
- Registration, login, and password-recovery initiation verify a short-lived
  Turnstile response. Authenticated mutations require the MAC-bound CSRF token.
- Zod request schemas reject unknown fields, URLs are restricted to HTTP(S), and
  uploaded bytes are sniffed with `file-type` instead of trusting the browser MIME
  declaration. Oversize files return `413 FILE_TOO_LARGE`.
- OAuth codes, state, secrets, provisioning keys, cookies, and tokens are removed
  from request logs. Response DTOs remain field-by-field projections.
- The web deployment sends HSTS, CSP, frame protection, referrer, permissions, and
  content-type headers. The CSP explicitly permits only Turnstile, the configured
  Render API pattern, local assets, Cloudinary media, and verified Google avatar
  media.

### Not yet fixed — known and scheduled

| Defect | Impact | Fixed in |
|---|---|---|
| Keyword search is an unindexed regex scan | Full collection scan per search. Injection and ReDoS are closed; this is a performance ceiling, not a vulnerability | 3 |
| Replacing a company logo orphans the previous Cloudinary asset | Storage growth; the orphan stays publicly readable | unscheduled |

## Authentication design (Phase 1B, as built)

- **Hashing:** Argon2id — 19 MiB memory, 2 iterations, parallelism 1 (OWASP
  baseline). Existing bcrypt hashes are detected by prefix and transparently
  rehashed on next successful login.
- **Access token:** JWT, 15-minute lifetime, `httpOnly` + `secure` + `sameSite`
  cookie named per portal.
- **Refresh token:** opaque 32 random bytes, 7-day lifetime, stored SHA-256
  hashed with a family id. Rotated on every use. Presenting an already-spent
  token means theft, so the whole family is revoked and the session ends.
- **CSRF:** double-submit token, since auth rides in cookies. The token is
  **MAC-bound**, not a bare random value, and its cookie is named per portal so
  concurrent sessions cannot overwrite one another. See ADR-0005 and ADR-0008.
- **Email verification:** 6-digit OTP via Brevo, hashed at rest, 10-minute TTL,
  5 attempts. Codes are stored as
  `HMAC-SHA256(OTP_PEPPER, "<subjectId>:<code>")` — bound to the subject, not
  the bare code, so a hash lifted from one account's row cannot be replayed
  against another. The failure budget is cumulative **per account per purpose**,
  not per code: requesting a fresh code does not reset the attempt counter, or
  five attempts would become unlimited attempts at three requests an hour.
- **Login hardening:** dummy hash comparison when the email does not exist, so
  response timing cannot enumerate registered addresses. Exponential backoff
  lockout from the fifth failure. Uniform failure message regardless of cause.
- **Google OAuth:** authorization-code flow with PKCE, portal bound into the
  `state` parameter, `email_verified` required.

### Account linking rule

When a Google sign-in matches an existing account by email, link **only if**
that account is already email-verified or has no password.

This closes a takeover path: an attacker registers `victim@gmail.com` with a
password of their choosing and never verifies it. If the victim later signs in
with real Google and we linked unconditionally, the victim would land in an
account whose password the attacker knows. Since the attacker never proved
control of the mailbox, that credential is discarded rather than honoured.

A **verified** account with a password is not linked silently either — that
would let anyone who controls a Google account with a matching address walk into
it. Instead the flow stops and emails a single-use confirmation link to the
address; only following that link connects the two. The browser is told nothing
except "check your email", so the branch is not an oracle for which addresses
are registered.

**Amendment (2026-08-01, implemented).** This section previously said an
unverified password account is *deleted and recreated* from the Google identity.
The implementation takes it over **in place**: same `_id`, password cleared,
`emailVerifiedAt` set. The security property is identical — the attacker's
credential is destroyed — but deletion would orphan every `Application`, `Job`
and `Company` pointing at that `_id`. The account owner is emailed when this
happens.

## Rate limits

All of these are mounted per portal, so the seeker and recruiter endpoints hold
independent counters.

| Scope | Limit | Status |
|---|---|---|
| Global per IP | 100 / min | Active |
| Login per IP + email | 5 / 15 min | Active |
| OTP request per portal + email | 3 / hour | Active |
| Registration per IP | 10 / hour | Active |
| OTP redemption per IP | 10 / hour | Active |
| Google sign-in start per IP | 10 / hour | Active |

Redemption is limited per IP rather than per email because the email in the body
is attacker-chosen: keying on it would let one attacker cycle addresses to get an
unlimited number of guesses. The per-account failure budget is the real defence;
this limit only blunts the volume.

Single-process, in-memory. See
[ADR-0004](docs/adr/0004-no-redis-phase-1.md) — running a second API instance
means an attacker gets 2× every limit above, so Redis becomes mandatory at that
point.

## Database and encryption boundary

This deployment does **not** expose a database key to the browser. `MONGO_URI`
is a server credential and belongs only in Render or the local API `.env`; a
MongoDB connection string is not equivalent to a restricted Supabase-style
public key.

MongoDB also has no SQL-style row-level-security switch to enable. Record access
is enforced in the API service layer: owned resources are queried with the
authenticated owner id, applications reach recruiter ownership through their
job, and admin routes require an admin-signed session. `sanitizeFilter` is
enabled globally and request inputs are schema-validated before queries run.

A recruiter's own contact details are a narrower case than the rest of this PII,
because the surface carrying them is public. `/job/get` and `/job/get/:id` are
`optionalAuthenticate`, so anything a `JobDto` carries unconditionally is served
to crawlers. The `postedBy` block therefore splits: the recruiter's name and
designation identify who is hiring and are public, while their email and phone
are attached only when the request resolves an authenticated seeker — the same
signal that gates `fit`. The keys are absent rather than null for a caller not
entitled to them, and `tests/auth/publicJobs.test.ts` asserts both key sets so a
future widening of the DTO fails there rather than silently publishing a
harvestable recruiter contact list.

Passwords are Argon2id hashes. OTPs and refresh tokens are stored only as keyed
hashes. Resume objects use Cloudinary's authenticated delivery mode and short-
lived signed URLs. Email, phone, names, and application content remain readable
to the application because the product must query or display them; there is no
application-level field encryption for that PII. Production therefore depends
on Atlas TLS, provider-managed encryption at rest, encrypted backups, and a
database user limited to the one application database. Those are Atlas settings
and must be verified in the deployment dashboard; the repository cannot enable
or prove them.

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
| `OTP_PEPPER` | `openssl rand -base64 48`. Invalidates outstanding verification and recovery codes. |
| `CSRF_SECRET` | `openssl rand -base64 48`. Existing CSRF tokens stop validating; users may need to refresh or sign in again. |
| `ADMIN_PROVISIONING_SECRET` | `openssl rand -base64 48`. Distribute the replacement only through a private channel. |
| Cloudinary | Console → Settings → Access Keys → regenerate |
| Brevo | SMTP & API → API Keys → delete and recreate |
| Google OAuth | Cloud Console → Credentials → Reset secret |
| Cloudflare Turnstile | Turnstile dashboard → rotate secret key; update Render before revoking the old value. |

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

**2026-08-04.** `backend/.env.example` was committed carrying **real values**
rather than the empty template it is supposed to be: a live MongoDB Atlas URI
including its password, and four real 48-byte secrets. It landed in the Phase 1B
bridge commit. Two things made it easy to miss — the file is *expected* to be
tracked, so no `.gitignore` rule or review reflex applies to it, and it had been
saved as **UTF-16LE**, which defeats every `grep`-based secret scan including the
completeness check in this repository's own plan.

Contained before publication: the commit had not been pushed, and `origin/main`
still predated it, so `.env.example` had never existed in a remote commit. The
file was rewritten as UTF-8 with no values, history was rewritten across the six
unpushed commits with `git filter-branch --index-filter`, and the old blob was
purged via `refs/original` deletion, reflog expiry and `git gc --prune=now`.
Verified: exactly one version of the file is reachable from any ref, and the old
blob no longer exists in the object database.

Two follow-ups worth keeping: a secret scan that only greps UTF-8 will not see a
UTF-16 file, and `.env.example` deserves the same scrutiny as `.env` precisely
because it is the one such file that is meant to be committed.

**2026-07-31.** `Backend/.env` was committed in the initial commit and removed in
a later one, leaving MongoDB, JWT, and Cloudinary credentials in history. The
repository was private, limiting exposure to accounts with access rather than the
public. Mongo credentials were rotated; history was purged with `git filter-repo`
and force-pushed, also removing 3,262 tracked `node_modules` files and reducing
the repository from 4.5 MB to 292 KB. Verified absent from all remaining commits.

## Practices

- `.env` is gitignored; only `.env.example` is tracked, with names and no values
- Application-generated auth secrets require 32+ characters and must all differ,
  enforced at startup
- Dependencies are audited in CI by `scripts/audit-prod.mjs`, which checks
  **production dependencies only** and fails on any high or critical advisory
  that is not explicitly allowlisted
- Dev-only advisories are excluded deliberately: a DoS in a linter's transitive
  glob parser cannot be reached by a user, and treating it as a build failure
  produces a permanently red check that trains everyone to ignore CI
- No secret is ever logged — redaction is enforced in the Pino config

## Allowlisted advisories

The production allowlist is currently empty. Every high or critical production
advisory fails CI. A future exception must record why the vulnerable code path is
unreachable and the exact condition that requires the decision to be revisited.
