# Phase 1C — Authorization & Domain Hardening (Design)

Date: 2026-08-04. Status: approved by user (approach C — full restructure of the
three domain modules, search-index tuning deferred).

## Goal

Close every known authorization and domain defect left open after Phase 1B, and
finish the structural migration so the domain modules match the 1B module
conventions. Exit criteria: `bridgeAuth`, `optionalBridgeAuth` and `req.id` are
deleted; `sanitizeFilter` is on; every domain route has an ownership check and a
DTO; the legacy `users` collection is dropped.

## Current defects being fixed

- 5 unscoped IDOR handlers: `GET /company/get/:id`, `PUT /company/update/:id`,
  `POST /job/post` (body `companyId` unchecked), `GET /application/:id/applicants`,
  `POST /application/status/:id/update`.
- `getApplicants` returns raw populated Mongoose documents (full seeker PII).
- `$regex` on raw `req.query.keyword` (`job.controller.ts:57-58`) — ReDoS /
  arbitrary regex.
- `GET /apply/:id` mutates state; apply dedupe is a race-prone `findOne` with no
  unique index.
- No pagination on any list endpoint; no Zod validation on any domain input;
  `status` update 500s on non-string input.
- Resume `storageKey` stores a public, permanent Cloudinary URL.
- Company logo upload crashes when no file is sent; multer has no size/type
  limits.
- Dual ownership fields: `Company.userId` (used) vs `Recruiter.company` (unused).
- `Company.name` is globally unique across all recruiters.
- Legacy: `bridgeAuth`/`req.id` still power all domain routes; `sanitizeFilter`
  off; dead `users` collection on disk.

## Design

### 1. Contracts (packages/shared)

Zod schemas + inferred types for company, job, application:

- Bodies: `companyCreate`, `companyUpdate`, `jobCreate`, `applicationStatusUpdate`
  (`status: z.enum(["accepted","rejected"])` — `pending` is default-only).
- Queries: shared `pagination` (`page` ≥ 1 default 1, `limit` 1–50 default 20),
  `jobSearchQuery` (`keyword` optional, trimmed, max length).
- Response DTOs: `CompanyDto`, `JobDto`, `JobListItemDto`, `ApplicationDto`,
  `ApplicantDto` (name, email, headline, resume link, appliedAt, status — nothing
  else), list envelope `{ items, page, limit, total }`.

### 2. Auth cleanup

- All domain routes move to `authenticate(portal)` / new `optionalAuthenticate`
  (public job browsing). Portal remains a route literal.
- Delete `bridgeAuth.ts`, `req.id` (and its `express.d.ts` field). The six
  `req.id` readers move to `req.auth.id`.
- Flip `sanitizeFilter: true` globally once every domain input passes through
  Zod (`authFields.ts` comment documents this as the gate). Bridge/sweeper
  queries that legitimately use operators pass trusted literals, not user input;
  audit and annotate them during the flip.

### 3. Ownership (service layer)

- Company read-by-id/update: `company.userId` must equal `req.auth.id`
  Missing and foreign both return 404 (no existence oracle for other
  recruiters' resources); applied consistently across all ownership checks.
- Job create: the posted `companyId` must resolve to a company owned by the
  caller. Job admin list already scoped by `created_by`.
- Applicants / status update: resolve Application → Job → `created_by` must
  equal caller.
- Drop `Recruiter.company` (unused, contradicts `Company.userId`).
- `Company.name` unique becomes compound `{ userId, name }`.
- Tests: every route gets the authorization matrix — anonymous / seeker /
  unrelated recruiter / owner, each asserting its status code.

### 4. Domain fixes

- `GET /apply/:id` → `POST /apply/:id`; unique compound index
  `{ job, applicant }`; duplicate apply returns 409 via the index, not a
  pre-read.
- Remove denormalized `Job.applications` array; applicant lists query the
  Application collection.
- Search: escape user keyword before building the regex (helper in shared or
  lib), empty keyword returns unpaginated-first-page of all jobs. Text index
  deferred (revisit in Phase 3).
- Pagination on all list endpoints via the shared query schema.
- Multer: 5 MB limit; resumes restricted to PDF, logos to png/jpeg/webp;
  missing-file handled as a 400 (or no-op for optional logo), not a crash.

### 5. Resume URLs

- Cloudinary uploads switch to `type: "authenticated"`; `resume.storageKey`
  stores the `public_id` (not a URL).
- DTO layer generates short-lived signed URLs on read. Company logos stay
  public (not sensitive).
- Existing dev-data resumes are not migrated (no production data exists).

### 6. Teardown & migration

- Drop the legacy `users` collection via a one-time npm script
  (`migrate:phase1c`), run manually; no on-boot migration logic.
- Delete remaining legacy type fields and the `bridgeAuth` test file's
  legacy-path cases (keep the "legacy token rejected" assertions where they
  still apply to `authenticate`).

### 7. Module structure

Each of company/job/application becomes `routes → controller → service →
model` per CLAUDE.md: controllers HTTP-only, services own business rules and
models, no cross-module model imports (application service reaches Job via the
job service's exported functions).

## Out of scope

UI redesign (Phase 2), text-index/ranked search, profile feature work beyond
validation/DTO, Redis, new features of any kind.

## Frontend impact (mechanical only)

Apply becomes POST; list responses become `{ items, page, limit, total }`
envelopes; applicant objects shrink to `ApplicantDto`; resume links come from
the DTO (signed) instead of the stored URL.

## Testing

Vitest + Supertest per existing harness. New `tests/company.test.ts`,
`tests/job.test.ts`, `tests/application.test.ts` with the four-role
authorization matrix per route, plus regex-escape, duplicate-apply race
(parallel requests), pagination bounds, and multer rejection cases. Cloudinary
is mocked (existing pattern from profile tests if present, else a module mock).
