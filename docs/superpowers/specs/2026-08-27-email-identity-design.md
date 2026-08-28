# Email Identity — Project B

**Status:** Implemented 2026-08-27. Design agreed with the user 2026-08-27.

This is the second of the four projects decomposed on 2026-08-26. Project A
(identity fields, completion gate, three profile surfaces) shipped 2026-08-26
and is live. C (under-18 internships) and D (oversight queues) shipped
2026-08-27, each with its own spec in this directory.

One spec covers both halves — cross-portal email uniqueness and OTP-verified
email change — because the uniqueness rule *is* the "is this address free?"
check the email change consults. Splitting them writes that check twice.

## Problem

Two gaps, one shared mechanism:

1. **Email is unique only within a collection.** `applyAuthIndexes` puts
   `{ email: 1 }, { unique: true }` on each of `seekers`, `recruiters` and
   `admins` independently. MongoDB has no cross-collection unique index, so
   nothing today stops `asha@example.com` from holding a seeker account and a
   recruiter account simultaneously. That was deliberate once (see
   **Reversal** below); the platform now wants one person to be one login.
2. **An email address can never change.** `grep changeEmail|newEmail` across
   `backend/src`, `frontend/src` and `packages/shared/src` returns nothing.
   Every account is permanently bound to the mailbox it arrived with, which is
   the single point of failure for recovery, lockout and identity on the
   platform.

## Reversal — what this undoes, on purpose

Cross-portal uniqueness contradicts a documented, load-bearing decision, and
the reversal is the point of this section:

- `docs/adr/0001-two-account-collections.md` lists "two collections, email
  globally unique" under **Alternatives considered — rejected**, on two
  grounds: a cross-collection uniqueness check on every signup is racy, and it
  permanently prevents anyone from being both a seeker and a recruiter.
- `README.md` calls the dual-account behaviour "the single most surprising
  behaviour for a new reader, and it is deliberate."
- `backend/src/models/authFields.ts:87`, `docs/adr/0002`, `docs/adr/0005` and
  `docs/adr/0008` all assume it in passing.
- `backend/tests/models.test.ts:91` asserts it ("scopes email uniqueness to
  one collection").

Both of ADR-0001's objections are addressed rather than ignored: the race is
resolved by a registry collection whose unique index is the guarantee (the
same doctrine `register()` already states: "the findOne above is a fast path,
not the guarantee — the unique email index is"), and the product loss — one
person can no longer hold both account types — is an explicit, user-taken
decision below. Verified 2026-08-26 and re-checked at ship time: **zero**
cross-portal collisions exist in `jobportal` or `jobportal_dev`, so the
reversal costs no data migration and no one loses an account.

## Decisions (locked with the user, 2026-08-27)

1. **Full cross-portal uniqueness.** One email address holds exactly one
   account across seeker, recruiter and admin. Registering an address that
   exists on any portal returns `EMAIL_TAKEN`. The dual seeker+recruiter
   capability ends, deliberately.
2. **A registry collection is the mechanism.** Not an application-level check
   across the three collections: two concurrent registrations on different
   portals would both pass it, and the codebase's own comment names that trap.
   The registry's unique index is the guarantee.
3. **Email change requires the current password when the account has one**,
   plus the code to the new mailbox. Google-only accounts (no password) use
   session + code. A stolen session alone can no longer redirect an account's
   recovery to an attacker's mailbox.
4. **Admins get the stronger two-stage flow** (carried from the 2026-08-26
   decomposition): current password **and** a code to the existing address
   before the new address is even mailed. The highest-privilege account needs
   the password *and* the current mailbox before a change begins.

## Facts verified against current code (2026-08-27)

- **Five account-creation sites**, not the four the planning note recorded:
  `register()` (`auth.service.ts`), the Google stranger branch
  (`googleAuth.service.ts`, seeker-only by the `portal !== "seeker"` guard),
  `createAdmin()` (`adminProvisioning.service.ts`), `seedAdmin()`
  (`scripts/seed-admin.ts`) and `seedDemoCatalog()`'s owner row
  (`scripts/seed-demo-catalog.ts`). All five need the registry write.
- The sweeper (`lib/sweeper.ts`) is the **only** code that deletes accounts.
  Its children-first batch already deletes OtpCode/OtpBudget/RefreshToken rows
  before the account; the registry row joins that batch.
- OTP purposes are `["verify_email", "reset_password"]` in three places that
  must stay in sync: the `otpCode` enum, the `otpBudget` enum, and the
  `OtpPurpose` type — plus `renderOtpEmail`, which branches on purpose.
- Redemption's security doctrine (verify-email, reset-password): the caller's
  email selects **which hash to compute**, never which account to mutate; the
  mutated account comes from the matched row's `subjectId`; a cumulative
  per-subject/per-purpose budget charges before lookup and refunds on success;
  single-use is enforced by a guarded second write. Email change inherits all
  of it.
- `sessionsInvalidatedAt` + `revokeAllForSubject` is the existing "kill every
  session including leaked access tokens" pair, set today on password reset
  and Google takeover-in-place.
- Session holders are verified by construction: `login()` refuses unverified
  accounts after the password check, and Google-created accounts arrive
  verified. Email change is therefore verified-accounts-only with no extra
  gate.
- `session.test.ts`'s dual-portal test mints bare ObjectIds and never creates
  email accounts — only its comment ages. `models.test.ts:91` is the one test
  that asserts the old rule and must be inverted.
- Mail cannot be delivered from this machine (Brevo's IP allowlist 401s every
  call). Tests use `installCaptureMailer` and read the `outbox`; delivery in
  prod rides the same `dispatch` path register and reset already use.

## Design

### 1. The `emailRegistry` collection

```
{ email: String, unique: true | portal: seeker|recruiter|admin | subjectId: ObjectId | createdAt }
```

One row per account. Model lives beside the other models, indexed through its
own `apply`-style helper; tests that depend on the unique index await
`EmailRegistry.init()` (autoIndex otherwise races the first duplicate insert).

**Write order at all five creation sites:** insert the registry row first,
then create the account. An E11000 on the registry translates to the existing
`EMAIL_TAKEN` conflict (409). If the account creation then fails for any
reason, a compensating delete frees the row. `register()`'s existing fast-path
`findAccountByEmail` stays as the cheap pre-check; the registry insert is the
guarantee, exactly as the per-collection index is today.

**The per-collection unique indexes stay.** They become a backstop that makes
registry drift fail loudly on the same portal; the registry is what guards
across portals. `findAccountByEmail` remains per-portal — nothing else in the
codebase needs a cross-portal read, and this spec adds no consumer that does.

**Sweeper integration:** the batched children-first delete gains one entry —
`EmailRegistry.deleteMany({ subjectId: { $in: ids } })` — so an abandoned
unverified registration gives the address back, exactly as it does within a
collection today.

**Drift is an accepted risk with two controls.** A crash between the registry
insert and the account create leaves an orphan row; a crash mid-email-change
(§2) can leave a stale one. The reconciliation rule is exact: *per subject,
exactly one registry row, matching that account's `email`.* A row whose
`subjectId` does not exist in its portal's collection is an orphan (delete); a
row whose account's `email` differs from the row's is stale (delete — the row
matching the account's actual email is authoritative). A script applies the
rule and reports what it touched; a test asserts registry ⇄ accounts
agreement survives each mutation path. The script doubles as the pre-flight
scan before the unique index is trusted.

**Migration:** a backfill script writes one row per existing account across
the three collections (two rows in `jobportal` — one seeker, one admin, the
catalogue owner having been deleted from prod by hand — and four in
`jobportal_dev`, at time of writing). The unique index exists first (push 1
boots the model into an empty collection), so a collision during backfill
fails loudly — that failure *is* the re-verification of zero collisions, run
at ship time rather than trusted from the 2026-08-26 count.

### 2. Email change

**Routes.** Two mounts over one shared service, per ADR-0006's rule that an
admin cookie never silently satisfies a route meant for "some signed-in user":

| Mount | Gate |
|---|---|
| `POST /user/email-change` | `authenticateAny()` + `csrfProtection()` |
| `POST /user/email-change/confirm` | `authenticateAny()` + `csrfProtection()` |
| `POST /admin/email-change` | `authenticate("admin")` + `csrfProtection()` |
| `POST /admin/email-change/confirm` | `authenticate("admin")` + `csrfProtection()` |

No Turnstile: the session is the bot barrier, CSRF covers the browser-attached
write.

**Seeker / recruiter — one code, to the new address.**

*Start* `{ newEmail, password? }`:
- Normalise (trim + lowercase, as `register` does); reuse the shared email
  validation.
- Same as the current address → 400 `EMAIL_UNCHANGED` (a no-op is not a
  change).
- If the account has a password, `password` is required and must verify.
  Missing-or-wrong both answer 401 `PASSWORD_INVALID` — uniform, so the
  response never says whether the account has a password. Google-only accounts
  (no hash) skip the field.
- Advisory availability lookup against the registry → 409 `EMAIL_TAKEN` for
  fast feedback. **Nothing is reserved at this point:** the registry is only
  touched at redemption, so starting changes you never finish cannot squat
  addresses.
- Store `pendingEmailChange { newEmail, requestedAt, confirmedCurrentAt: null }`
  on `authFields` — same idiom as `pendingGoogleLink`: latest attempt wins, a
  new start overwrites any older pending.
- `issueOtp(..., "change_email", deliver to the NEW address)` — code through
  the shared machinery (supersedes any live `change_email` code, enqueued
  dispatch, never awaited). A warning goes to the OLD address: "a change to
  <new> was requested; if this wasn't you, your session may be compromised —
  change your password." Start sits behind `requireMailerAvailable`.

*Confirm* `{ code }`:
- The account comes from the session, never the body; the pending change is
  read off the account. No pending, or one older than 24 hours, is
  indistinguishable from a wrong code: uniform 400 `OTP_INVALID`.
- Redeem with the existing pattern: `chargeOtpAttempt` on the `change_email`
  budget (atomic pre-charge, refunded on success), hash-bound match, guarded
  single-use claim.
- The swap, in order:
  1. **Insert** the registry row for the new address. E11000 → 409
     `EMAIL_TAKEN` — this is the real check; someone may have taken the
     address between start and confirm.
  2. **Update** the account: `email` → new address, `emailVerifiedAt` → now
     (the code proved the new mailbox), `sessionsInvalidatedAt` → now, clear
     `pendingEmailChange`.
  3. **Delete** the old address's registry row — the old address is free from
     this instant and may be registered by anyone.
  4. `revokeAllForSubject`, `clearOtpBudget`.
- Response 200 with a message the client surfaces: *sign in with your new
  address.* Every session is dead by design, including the caller's.

**Admin — two codes, deliberately.**

*Start* `{ newEmail, password }` (an admin with a session necessarily has a
password — the only admin sign-in is password login): verify the password,
store the pending change, and mail a `change_email` code **stage
`confirm-current`** to the OLD address. The mail explains the request and
carries the code; no separate warning template is needed for admins — the
stage-1 mail *is* the warning.

*Confirm* drives a two-step state machine on the pending change:
- A `confirm-current` code redeems only while `confirmedCurrentAt` is null,
  and sets it. Only then is the second code mailed — stage `confirm-new`, to
  the NEW address.
- A `confirm-new` code redeems only while `confirmedCurrentAt` is set (and the
  pending is within 24 hours), and performs the same swap as above.
- Stage is enforced twice: the `OtpCode` row carries it, and the pending
  change's state must agree. A stage-1 code presented as stage 2 fails both.
  (Seeker and recruiter confirm never reads `confirmedCurrentAt` — their
  single code is the whole proof, and their start leaves the field null.)

**Code plumbing.** One new purpose `change_email`, added to the `otpCode`
enum, the `otpBudget` enum and the `OtpPurpose` type, kept in sync the way the
file comments demand. `OtpCode` gains an optional `stage` field
(`confirm-current` | `confirm-new`), set only for `change_email` rows; seeker
and recruiter rows carry `confirm-new` (they prove the new mailbox; there is
simply no earlier stage). `issueOtp` takes the stage through without otherwise
changing. `renderOtpEmail` gains a `change_email` branch; one new warning
template serves the seeker/recruiter old-address notification.

The `change_email` budget is its own row per subject — burning it does not
touch `verify_email` or `reset_password` allowances, and vice versa.

**Oracle and rate rules.** Start and confirm are authenticated owner actions,
so distinct errors are acceptable where a stranger-facing endpoint would unify
— except confirm, which stays uniform `OTP_INVALID` for wrong/expired/no-pending,
with `EMAIL_TAKEN` as the only distinct rejection. Rate limits mirror
the existing ones: start 3/hour keyed by subject (a session is the identity,
not the IP); confirm 10/hour per IP, matching the other redemptions.

**Crash windows.** Insert-new → crash leaves an orphan row for the new
address; update-account → crash leaves the stale old row. Both converge under
§1's reconciliation rule, and neither window hands an attacker anything: no
session survives the swap, and a half-moved address cannot be squatted because
the stale row still belongs to its owner.

**Session projection.** `SessionUser` gains two owner-only fields:
`hasPassword` (hash present — the dialog needs it to render the right shape;
`/me`'s read selects the hash column but `toSessionUser` never projects it)
and `pendingEmailChange` (new address + requested time, or null) so a user who
closed the dialog mid-flow can resume at the code step.

### 3. Surfaces, copy, docs

**Frontend.** The shared `IdentityCard` renders the email on all three
portals; it gains a **Change** action on that row. The dialog's steps:
new address (+ password re-entry iff `hasPassword`) → code entry (admin: two
code steps, old-address code then new-address code, with `pendingEmailChange`
driving which step resumes). On success the dialog clears local auth state and
routes to the portal's own login — `/login`, `/hire/login` or `/admin/login` —
with "Email updated — sign in with your new address."

Signup's `EMAIL_TAKEN` copy needs no change; it simply became globally true.
Any remaining copy claiming dual-account behaviour is found by grep at
implementation time and updated (the 2026-08-27 grep found it only in the
docs, comments and one test named above).

`updates.ts` gets a new **top-of-array** entry (order is asserted by test):
one email address is one account, and the address itself can now change.

**Docs, amended not rewritten.** README's "most surprising behaviour"
paragraph flipped to the new rule and marked as changed. Amendments to
ADR-0001 (the rejected alternative, adopted: why, and what resolved both of
the original objections), ADR-0002, ADR-0005 and ADR-0008 (the dual-account
premise is gone; the portal-cookie and cryptographic-boundary machinery stays
— it was never about two accounts, it is about the portal boundary). The
`authFields.ts:87` comment rewritten. SECURITY.md checked for
email-immutability claims.

### 4. Tests

Registry:
- Cross-portal duplicate refused through the real service paths (register,
  Google stranger branch, `createAdmin`, `seedAdmin`, `seedDemoCatalog`).
- Raced parallel registrations of one address on two portals: exactly one
  winner — the index-is-the-guarantee test.
- Compensating delete frees the row when account creation fails.
- Sweeper deletes free the row.
- Reconciliation repairs both crash shapes (orphan, stale) and the test
  asserts registry ⇄ accounts agreement after every mutation path.
- `models.test.ts:91` inverted: same-portal duplicates still E11000 at the
  model level; cross-portal duplicates are possible at the raw-model level and
  refused by every service path — the layering is the assertion.

Email change:
- Happy path (password account): start → outbox holds code-at-new-address and
  warning-at-old-address → confirm → email moved, `emailVerifiedAt` fresh,
  old access token refused, registry swapped exactly (old row gone, new row
  present), old address re-registers immediately.
- Google-only account: no password demanded; flow completes.
- Password account, password missing or wrong: 401, nothing mailed, nothing
  stored.
- Start reserves nothing: a stranger who registers the target address between
  start and confirm wins; the confirmant's redemption answers `EMAIL_TAKEN`.
  An abandoned start squats nothing.
- Same-address start: 400, no code.
- Uniform confirm: wrong code / expired code / no pending / stale pending all
  answer `OTP_INVALID`.
- Budget isolation: burning `change_email` leaves the other purposes' budgets
  untouched.
- Cross-purpose and cross-stage replay: a `verify_email` code cannot confirm a
  change; an admin stage-1 code cannot redeem as stage 2; stage order
  enforced (stage-2 confirm before stage 1 → invalid).
- Both endpoints: 401 unauthenticated, refused without CSRF.
- Sessions die: `sessionsInvalidatedAt` set, refresh families revoked.
- Admin flow: full two-stage path; wrong password rejected; a re-start resets
  `confirmedCurrentAt`.

Frontend:
- Dialog shape follows `hasPassword`; a pending change resumes at the code
  step.
- Success clears local auth state and lands on the correct portal login.
- `EMAIL_TAKEN` and `PASSWORD_INVALID` surface as readable errors.

### 5. Rollout

Two pushes, because the registry is only a guarantee once populated, and
every push to `main` auto-deploys both hosts:

1. **Push 1 — mechanism, inert.** `emailRegistry` model, backfill script,
   reconciliation script, their tests. Nothing consults the registry yet;
   behaviour is unchanged. Then run backfill against `jobportal` and
   `jobportal_dev`, and reconciliation as the pre-flight proof of zero
   collisions.
2. **Push 2 — enforcement and feature.** Creation-site integration, email
   change backend and frontend, docs amendments, release-note entry.

The manual gate between the pushes is the backfill itself: enforcement must
never run against an empty registry, or an existing account's address would
read as free.

## Non-goals

- **C and D** — under-18 internships and oversight queues are separate
  projects with their own planning notes.
- **Account linking / merging.** One person who today would have held two
  accounts holds one; merging existing rows is not offered.
- **Changing anything but the address** — name, phone, and the
  `phone`/`phoneNumber` naming inconsistency are out of scope.
- **Account deletion.** No deletion surface exists; the sweeper remains the
  only code that removes accounts.
- **A cross-portal read API.** Nothing outside the registry itself reads
  across collections.

## Known limits

- **Mail cannot be verified end to end on this machine** (Brevo's IP
  allowlist). Delivery is proven by outbox tests and by sharing the `dispatch`
  path register and reset already run in prod.
- **The dual-account capability is gone permanently unless the registry is
  later relaxed.** That is the decision, taken knowingly, at the moment of
  cheapest reversal (zero collisions, six prod accounts).
- **A pending change is visible to anyone holding the session** (it is in the
  session projection). That is the same trust level the session already holds;
  the password step-up is what keeps a stolen session from *completing* a
  change on password accounts.
