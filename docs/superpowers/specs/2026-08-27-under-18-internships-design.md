# Under-18 Internships — Project C

**Status:** Implemented 2026-08-27. Decisions locked with the user 2026-08-27.

Third of the four projects decomposed on 2026-08-26 (A identity fields, B email
identity — both shipped). This one opens the platform to 16- and 17-year-olds
under the constraints that make that defensible.

## Problem

The platform refuses every under-18 date of birth with
"You need to be 18 or over to join Cairn. We're working on internships for
younger candidates." — a promise of future work. Project A landed the DOB
field, a derived age, and the identity gate; the machinery to keep that promise
now exists and nothing uses it. The under-18 market is unserved whatever the
job board offers: prod carries 3 internship listings, and a 17-year-old cannot
hold the account that would apply to them.

## Decisions (locked with the user, 2026-08-27)

1. **The join floor is 16.** Under-16 is refused outright with copy that names
   the number. 18 remains the adult age; 16-17 is the minor band.
2. **Guardian consent is proven by a code emailed to the guardian's address**
   — the same OTP machinery as verify-email, not a typed acknowledgement. A
   claim is not a proof.
3. **Minors are seekers only.** A recruiter completion with a DOB under 18 is
   refused: hiring authority over other people's data is not a minor's
   activity. Admin stays ungated as decided in Project A.
4. **Minor status is derived from DOB, never stored** — the same doctrine as
   `profileComplete`, for the same reason: two write paths exist, and a stored
   boolean drifts the moment either of them writes.
5. **Internship-only applications.** A minor's apply to a job whose
   `jobType` is not `"Internship"` is a 403 with copy that explains the rule.
   Browsing stays unrestricted — a minor sees the whole board.
6. **The identity gate grows a second exit for minors.** `isProfileComplete`
   for a seeker becomes: DOB present AND (not a minor OR guardian consent
   recorded). The gate itself is untouched — it still reads one derived
   boolean — so every existing mount keeps its meaning.

## Design

### Shared

- `MINOR_JOIN_YEARS = 16` joins `MIN_AGE_YEARS = 18`. `dobSchema`'s floor
  refinement switches to the join floor with new copy
  ("You need to be 16 or over to join Cairn."). `MIN_AGE_YEARS` stays 18 — it
  is the adult boundary the recruiter check and the minor derivation read.
- `isMinor(dob: Date | null, on?)` — derived, shared, and the single
  implementation. The model's DOB is a UTC-midnight `Date`; converting with
  `toISOString().slice(0, 10)` recovers the calendar string `ageInYears`
  reads, so both sides stay UTC end to end.
- `guardianConsentStartBodySchema { email }` and `guardianConsentConfirmBodySchema
  { code }` in `shared/auth.ts`.
- `SessionUser.isMinor` and `ProfileView.minor`: boolean projections. The job
  detail page renders its internship-only refusal from the session projection;
  the completion step renders its guardian stage from the profile view. The
  client never recomputes age from the wire DOB.

### Model

`authFields` grows a `guardianConsent` fragment (`email`, `consentedAt`,
both default null) and a `pendingGuardian` fragment (`email`, `requestedAt`)
in the `pendingGoogleLink` idiom: the address awaiting a code. Nothing is
backfilled — every existing account is an adult by the old floor, so
`guardianConsent: null` is already the correct state for all of them.

### The consent flow

Two endpoints on the user router, both `authenticateAny()` + CSRF, both
deliberately NOT behind `requireProfileComplete` — they are the route that
clears it, the same exemption `/profile/complete` holds:

- `POST /user/guardian-consent` (3/hour per subject, behind mail readiness):
  stores `pendingGuardian`, issues a `guardian_consent` OTP **mailed to the
  guardian's address**. The OTP row is subject-bound to the minor's account id
  like every other purpose — the digest binds the code to the account, and the
  delivery address is the only thing that differs.
- `POST /user/guardian-consent/confirm` (10/hour per IP): redeems through the
  same charge/refund budget as every other purpose, then moves
  `pendingGuardian` onto `guardianConsent` with a timestamp, guarded on the
  pending still naming the same address. No pending, a wrong code and an
  expired code answer the uniform `OTP_INVALID`.

`guardian_consent` joins the purpose enum in the four places it exists
(otpCode model, otpBudget model, `OtpPurpose`, `renderOtpEmail`).

### The completion step

`CompleteProfile` posts the identity block as today. A minor DOB saves — the
DO Bs the point — but the response's `profile.user.profileComplete` reads
false and `profile.minor` reads true, and the client renders the guardian
stage in place of the redirect: guardian email → code → done. An adult
completes exactly as before; a recruiter completion with a minor DOB is
refused (`RECRUITER_AGE_MINIMUM`, 400) before anything is written.

### Applying

`applyToJob` loads the job with `jobType` alongside the open check, and the
seeker's DOB: a minor applying to a non-internship answers
`MINOR_NON_INTERNSHIP` (403). The public job detail page carries the client
half for a signed-in minor — a disabled Apply and the reason — the same
pattern as the closed-role block, so the refusal is never the first the
person hears of the rule. The server check remains the enforcement; the page
is public and the guard is advisory.

## Testing

- Shared schema: under-16 refused with the new message; 16-17 accepted;
  adult behaviour unchanged.
- Backend: the consent flow end to end (mail to the guardian, completion
  flips, budget isolation); minor refused on a Full-time role and accepted on
  an Internship; recruiter completion refused for a minor DOB; adult accounts
  and every existing gate untouched.
- Frontend: the guardian stage renders on a minor completion and not on an
  adult one; the job detail page disables Apply for a minor on a
  non-internship role.

## Non-goals

- Work permits, document uploads, or any verification of the guardian's
  identity beyond mailbox control.
- Per-job age requirements, or internship postings restricted to minors.
- Any change to the sweeper, sessions, or email identity (Project B).
- Project D's oversight queues, including what an admin sees about a minor —
  D's DTOs carry only a derived boolean.
