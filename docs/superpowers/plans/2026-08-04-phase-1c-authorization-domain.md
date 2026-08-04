# Phase 1C — Authorization & Domain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the company/job/application modules on `authenticate` + ownership checks + Zod DTOs, delete `bridgeAuth`/`req.id`, turn `sanitizeFilter` on, and drop the legacy `users` collection.

**Architecture:** Each domain gets the 1B layering: route mounts `authenticate(portal)` and an HTTP-only controller; the controller validates with shared Zod schemas and calls a service; the service owns all model access and ownership predicates and returns DTOs. Ownership failures return 404 (never 403) so foreign recruiters cannot probe resource existence.

**Tech Stack:** Express 5, Mongoose 8, Zod (packages/shared), Vitest + Supertest + mongodb-memory-server, Cloudinary, multer.

## Global Constraints

- ESM + `NodeNext`: every relative import in `backend` and `packages/shared` ends in `.js`, even in `.ts` files.
- Errors: always `throw AppError` (`src/lib/AppError.ts`); never `res.status().json()` for failures; no try/catch that swallows.
- Responses: explicit DTOs only. Never serialize a Mongoose document.
- Portal is always a route-mount literal, never read from the request.
- Never read `process.env` outside `src/config/env.ts` (logger exception exists).
- Ownership failure policy: **404 with the resource's existing NOT_FOUND code** — identical body whether the resource is missing or foreign.
- Tests: mount `buildApp()` via Supertest; never listen. Every route touching a user-owned resource gets the four-role matrix: anonymous, seeker, unrelated recruiter, owner.
- Commits: conventional-commit style, **no Co-Authored-By trailer** (repo convention).
- Build order: `packages/shared` must be rebuilt (`npm run build --workspace @jobportal/shared`) before the API typechecks; `npm run ci` at the repo root does everything in order.
- Run backend tests with `npm test --workspace @jobportal/api -- <name>`.

---

### Task 1: Shared domain contracts

**Files:**
- Create: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/index.ts` (add export)
- Test: `packages/shared/tests/domain.test.ts` (same layout as existing shared tests — check `packages/shared/tests/` or wherever the 6 existing shared tests live; mirror their location)

**Interfaces:**
- Consumes: `paginationQuerySchema` from `./pagination.js` (already exists: `{ page: number>=1 default 1, limit: 1–50 default 20 }`).
- Produces (used by Tasks 4–7, 10): `objectIdSchema`, `companyCreateBodySchema`, `companyUpdateBodySchema`, `jobCreateBodySchema`, `jobListQuerySchema`, `applicationStatusBodySchema`, and types `CompanyDto`, `JobDto`, `AppliedJobDto`, `ApplicantDto`, plus existing `PaginatedResponse<T>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/tests/domain.test.ts
import { describe, expect, it } from "vitest";
import {
  applicationStatusBodySchema,
  companyCreateBodySchema,
  jobCreateBodySchema,
  jobListQuerySchema,
  objectIdSchema,
} from "../src/domain.js";

describe("domain schemas", () => {
  it("rejects a malformed object id", () => {
    expect(objectIdSchema.safeParse("not-an-id").success).toBe(false);
    expect(objectIdSchema.safeParse("64b0c8f2a9d3e45f6a7b8c9d").success).toBe(true);
  });

  it("company create requires a trimmed name", () => {
    expect(companyCreateBodySchema.safeParse({ name: "  " }).success).toBe(false);
    const ok = companyCreateBodySchema.parse({ name: "  Acme  " });
    expect(ok.name).toBe("Acme");
  });

  it("job create coerces salary and splits requirements", () => {
    const ok = jobCreateBodySchema.parse({
      title: "Dev", description: "Build things", requirements: "ts, node ,",
      salary: "12", experience: "2", location: "Remote", jobType: "full-time",
      position: "2", companyId: "64b0c8f2a9d3e45f6a7b8c9d",
    });
    expect(ok.salary).toBe(12);
    expect(ok.requirements).toEqual(["ts", "node"]);
  });

  it("job list query defaults and caps", () => {
    const q = jobListQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, limit: 20, keyword: "" });
    expect(jobListQuerySchema.parse({ keyword: "a".repeat(200) })).toBeTruthy; // see max below
    expect(jobListQuerySchema.safeParse({ keyword: "a".repeat(101) }).success).toBe(false);
  });

  it("status accepts only accepted/rejected", () => {
    expect(applicationStatusBodySchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(applicationStatusBodySchema.parse({ status: "accepted" }).status).toBe("accepted");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @jobportal/shared -- domain`
Expected: FAIL — module `../src/domain.js` not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/domain.ts
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

/** 24-hex Mongo ObjectId. Route params and body references both use this. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id");

export const companyCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const companyUpdateBodySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  website: z.string().trim().url().max(200).optional(),
  location: z.string().trim().max(120).optional(),
});

/**
 * `requirements` arrives as the legacy comma-string; normalized here so the
 * service never sees the raw shape. Numbers are coerced because the client
 * sends form strings.
 */
export const jobCreateBodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(5000),
  requirements: z
    .string()
    .max(2000)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
  salary: z.coerce.number().positive(),
  experience: z.coerce.number().int().min(0).max(50),
  location: z.string().trim().min(2).max(120),
  jobType: z.string().trim().min(2).max(40),
  position: z.string().trim().min(1).max(120),
  companyId: objectIdSchema,
});

export const jobListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});

/** `pending` is creation-default only; a recruiter can only decide, not undo. */
export const applicationStatusBodySchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type CompanyCreateBody = z.infer<typeof companyCreateBodySchema>;
export type CompanyUpdateBody = z.infer<typeof companyUpdateBodySchema>;
export type JobCreateBody = z.infer<typeof jobCreateBodySchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type ApplicationStatusBody = z.infer<typeof applicationStatusBodySchema>;

export type CompanyDto = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  location: string | null;
  logoUrl: string | null;
  createdAt: string;
};

export type JobDto = {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  salary: number;
  experienceLevel: number;
  location: string;
  jobType: string;
  position: string;
  company: CompanyDto | null;
  createdAt: string;
};

export type AppliedJobDto = {
  id: string; // application id
  status: "pending" | "accepted" | "rejected";
  appliedAt: string;
  job: JobDto | null;
};

/** Everything a recruiter may see about an applicant. Nothing else leaves. */
export type ApplicantDto = {
  applicationId: string;
  status: "pending" | "accepted" | "rejected";
  appliedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  headline: string | null;
  skills: string[];
  resumeUrl: string | null;
  resumeName: string | null;
};
```

Add to `packages/shared/src/index.ts`:

```ts
export * from "./domain.js";
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace @jobportal/shared -- domain` → PASS.
Run: `npm run build --workspace @jobportal/shared` → succeeds (later tasks typecheck against `dist`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add domain schemas and DTO types for phase 1C"
```

---

### Task 2: Model hardening + upload/regex infrastructure

**Files:**
- Modify: `backend/src/models/company.model.ts` (per-recruiter name uniqueness)
- Modify: `backend/src/models/job.model.ts` (remove `applications` array)
- Modify: `backend/src/models/application.model.ts` (unique `{job, applicant}`)
- Modify: `backend/src/models/recruiter.model.ts` (drop unused `company` field)
- Modify: `backend/src/middleware/multer.ts` (size/type limits)
- Create: `backend/src/lib/escapeRegex.ts`
- Test: `backend/tests/models.test.ts` (append), `backend/tests/escapeRegex.test.ts`

**Interfaces:**
- Produces: `escapeRegex(input: string): string`; `resumeUpload` and `logoUpload` (Express middlewares replacing `singleUpload`, still field name `"file"`); Application model with unique compound index (duplicate insert throws Mongo error `code === 11000`).
- NOTE for later tasks: `Job.applications` no longer exists; query `Application` instead. `singleUpload` is deleted.

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/models.test.ts` (follow its existing import style):

```ts
import { Application } from "../src/models/application.model.js";
import { Company } from "../src/models/company.model.js";
import { Types } from "mongoose";

describe("phase 1C model constraints", () => {
  it("rejects a duplicate {job, applicant} application at the index", async () => {
    await Application.init(); // ensure indexes exist in memory server
    const job = new Types.ObjectId();
    const applicant = new Types.ObjectId();
    await Application.create({ job, applicant });
    await expect(Application.create({ job, applicant })).rejects.toMatchObject({ code: 11000 });
  });

  it("company name is unique per recruiter, not globally", async () => {
    await Company.init();
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    await Company.create({ name: "Acme", userId: a });
    await expect(Company.create({ name: "Acme", userId: b })).resolves.toBeTruthy();
    await expect(Company.create({ name: "Acme", userId: a })).rejects.toMatchObject({ code: 11000 });
  });
});
```

```ts
// backend/tests/escapeRegex.test.ts
import { describe, expect, it } from "vitest";
import { escapeRegex } from "../src/lib/escapeRegex.js";

describe("escapeRegex", () => {
  it("neutralizes every regex metacharacter", () => {
    const hostile = "a+b*c?(d)[e]{1}^$|\\.";
    const re = new RegExp(escapeRegex(hostile));
    expect(re.test(hostile)).toBe(true);
    expect(re.test("aab")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @jobportal/api -- models` and `-- escapeRegex`
Expected: FAIL (no unique index → resolves; module not found).

- [ ] **Step 3: Implement**

`backend/src/lib/escapeRegex.ts`:

```ts
/** Escape user input for interpolation into a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

`company.model.ts`: remove `unique: true` from `name`; after the schema definition add:

```ts
companySchema.index({ userId: 1, name: 1 }, { unique: true });
```

`application.model.ts`: after the schema definition add:

```ts
// One application per seeker per job, enforced at the storage layer — the old
// findOne-then-create dedupe was a race.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
```

`job.model.ts`: delete the entire `applications: [...]` field block.

`recruiter.model.ts`: delete the line `company: { type: Schema.Types.ObjectId, ref: "Company", default: null },` (unused; `Company.userId` is the one ownership edge).

`backend/src/middleware/multer.ts` — replace the file with:

```ts
import multer from "multer";
import { AppError } from "../lib/AppError.js";

const MAX_BYTES = 5 * 1024 * 1024;

function uploader(allowed: readonly string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(AppError.badRequest("UNSUPPORTED_FILE_TYPE", `Expected one of: ${allowed.join(", ")}`));
    },
  }).single("file");
}

/** Seeker resumes: PDF only. */
export const resumeUpload = uploader(["application/pdf"]);
/** Company logos. */
export const logoUpload = uploader(["image/png", "image/jpeg", "image/webp"]);
```

Update the two importers of `singleUpload` (`routes/company.route.ts` → `logoUpload`, `routes/user.route.ts` → `resumeUpload`) so the backend still compiles; routes are otherwise untouched until Tasks 4/7.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace @jobportal/api -- models`, `-- escapeRegex`, then the full suite `npm test --workspace @jobportal/api` (bridge/publicJobs tests must still pass — nothing here changed behavior they assert; `applyJob` no longer compiles against `job.applications`, so ALSO apply the one-line fix now: in `application.controller.ts` delete the two lines `job.applications.push(newApplication._id); await job.save();`).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): unique application index, per-recruiter company names, upload limits, regex escaping"
```

---

### Task 3: `authenticateAny` and `optionalAuthenticate`

**Files:**
- Modify: `backend/src/middleware/authenticate.ts`
- Test: `backend/tests/auth/authenticate.test.ts` (append)

**Interfaces:**
- Consumes: `verifyAccessToken`, `findAccountById`, `accessCookieName` (same imports the file already has).
- Produces: `authenticateAny()` — resolves a session from either portal cookie (ordered seeker→recruiter, same semantics `bridgeAuth("any")` had), 401 `SESSION_MISSING` if neither; `optionalAuthenticate()` — same resolution but never 401s. Both set **only `req.auth`**, never `req.id`.

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/auth/authenticate.test.ts`, reusing its existing app-building/cookie helpers (`signedUpOn` from `./helpers.js` yields `{ access }`; cookie names are `jp_seeker_at` / `jp_recruiter_at`):

```ts
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { authenticateAny, optionalAuthenticate } from "../../src/middleware/authenticate.js";
import { errorHandler } from "../../src/middleware/error.js";
import { signedUpOn } from "./helpers.js";

function anyApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/any", authenticateAny(), (req, res) => res.json({ auth: req.auth }));
  app.get("/opt", optionalAuthenticate(), (req, res) => res.json({ auth: req.auth ?? null }));
  app.use(errorHandler);
  return app;
}

describe("authenticateAny / optionalAuthenticate", () => {
  it("resolves a seeker session and sets no req.id", async () => {
    const { access } = await signedUpOn("seeker", "any-seeker@example.com");
    const res = await request(anyApp()).get("/any").set("Cookie", [`jp_seeker_at=${access}`]);
    expect(res.status).toBe(200);
    expect(res.body.auth.portal).toBe("seeker");
  });

  it("401s with no cookie on authenticateAny", async () => {
    const res = await request(anyApp()).get("/any");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_MISSING");
  });

  it("optionalAuthenticate passes anonymous through as null", async () => {
    const res = await request(anyApp()).get("/opt");
    expect(res.status).toBe(200);
    expect(res.body.auth).toBeNull();
  });

  it("prefers seeker when both cookies are present (fixed order)", async () => {
    const s = await signedUpOn("seeker", "both-s@example.com");
    const r = await signedUpOn("recruiter", "both-r@example.com");
    const res = await request(anyApp())
      .get("/any")
      .set("Cookie", [`jp_seeker_at=${s.access}`, `jp_recruiter_at=${r.access}`]);
    expect(res.body.auth.portal).toBe("seeker");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- authenticate` → FAIL (no such exports).

- [ ] **Step 3: Implement** — append to `authenticate.ts`:

```ts
const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];

async function resolveSession(req: Request, portal: Portal): Promise<boolean> {
  const token = req.cookies?.[accessCookieName(portal)] as string | undefined;
  if (!token) return false;
  let claims;
  try {
    claims = verifyAccessToken(token, portal);
  } catch {
    // Stale cookie for one portal must not kill a route the other portal's
    // cookie would satisfy.
    return false;
  }
  const account = await findAccountById(portal, claims.sub);
  if (!account || account.status !== "active") return false;
  const cutoff = account.sessionsInvalidatedAt;
  if (cutoff && claims.iat !== undefined && claims.iat < Math.floor(cutoff.getTime() / 1000)) {
    return false;
  }
  req.auth = {
    id: String(account._id),
    portal,
    emailVerified: account.emailVerifiedAt !== null,
  };
  return true;
}

/**
 * Accepts a session from either portal, seeker first. The fixed order means a
 * dual-session browser gets the same identity on every request. Routes that can
 * name their portal must use `authenticate(portal)` instead.
 */
export function authenticateAny() {
  return async function authenticateAnyMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    for (const portal of CANDIDATES) {
      if (await resolveSession(req, portal)) {
        next();
        return;
      }
    }
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
  };
}

/**
 * Resolves a session if one exists; never 401s. Handlers behind this MUST
 * treat `req.auth` as absent-by-default.
 */
export function optionalAuthenticate() {
  return async function optionalAuthenticateMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    for (const portal of CANDIDATES) {
      if (await resolveSession(req, portal)) break;
    }
    next();
  };
}
```

(Optionally refactor `authenticate(portal)`'s body to share `resolveSession`; keep its distinct error split — `SESSION_MISSING` for no cookie, `SESSION_INVALID` for a bad one — exactly as-is, so don't force the refactor if it muddies that.)

- [ ] **Step 4: Run** — `npm test --workspace @jobportal/api -- authenticate` → PASS.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api): portal-agnostic authenticate variants to replace bridgeAuth"`

---

### Task 4: Company module rebuild

**Files:**
- Create: `backend/src/services/company.service.ts`
- Rewrite: `backend/src/controllers/company.controller.ts`, `backend/src/routes/company.route.ts`
- Test: `backend/tests/company.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas/DTOs, Task 2 `logoUpload`, `authenticate("recruiter")`.
- Produces (service, used by job service in Task 5):
  - `createCompany(ownerId: string, body: CompanyCreateBody): Promise<CompanyDto>`
  - `listCompanies(ownerId: string): Promise<CompanyDto[]>`
  - `getOwnedCompany(ownerId: string, companyId: string): Promise<CompanyDto>` (throws 404 `COMPANY_NOT_FOUND` on missing OR foreign)
  - `updateCompany(ownerId: string, companyId: string, body: CompanyUpdateBody, logo?: Express.Multer.File): Promise<CompanyDto>`
  - `assertCompanyOwned(ownerId: string, companyId: string): Promise<void>` (same 404 policy; exported for the job service)
  - `toCompanyDto(doc): CompanyDto`

- [ ] **Step 1: Write failing tests** — `backend/tests/company.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function createCompany(access: string, name = "Acme") {
  return request(app)
    .post("/api/v1/company/register")
    .set("Cookie", [`jp_recruiter_at=${access}`])
    .send({ name });
}

describe("company routes", () => {
  let owner: { access: string };
  let rival: { access: string };
  let seeker: { access: string };

  beforeEach(async () => {
    installCaptureMailer();
    owner = await signedUpOn("recruiter", "owner@example.com");
    rival = await signedUpOn("recruiter", "rival@example.com");
    seeker = await signedUpOn("seeker", "seeker@example.com");
  });

  it("registers a company and returns a DTO (no Mongoose internals)", async () => {
    const res = await createCompany(owner.access);
    expect(res.status).toBe(201);
    expect(res.body.company).toMatchObject({ name: "Acme", logoUrl: null });
    expect(res.body.company._id).toBeUndefined();
    expect(res.body.company.__v).toBeUndefined();
    expect(res.body.company.userId).toBeUndefined();
  });

  it("rejects an invalid body with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`])
      .send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("409s a duplicate name for the same owner but allows it for another recruiter", async () => {
    await createCompany(owner.access);
    expect((await createCompany(owner.access)).status).toBe(409);
    expect((await createCompany(rival.access)).status).toBe(201);
  });

  it("GET /get returns only the caller's companies", async () => {
    await createCompany(owner.access, "Mine");
    await createCompany(rival.access, "Theirs");
    const res = await request(app)
      .get("/api/v1/company/get")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`]);
    expect(res.body.companies.map((c: { name: string }) => c.name)).toEqual(["Mine"]);
  });

  // The authorization matrix for GET /get/:id and PUT /update/:id.
  for (const [route, method] of [["get", "get"], ["update", "put"]] as const) {
    describe(`${method.toUpperCase()} /${route}/:id matrix`, () => {
      let companyId: string;
      beforeEach(async () => {
        companyId = (await createCompany(owner.access)).body.company.id;
      });
      const call = (cookies: string[]) => {
        const r = request(app)[method](`/api/v1/company/${route}/${companyId}`).set("Cookie", cookies);
        return method === "put" ? r.field("name", "Renamed") : r;
      };
      it("anonymous → 401", async () => expect((await call([])).status).toBe(401));
      it("seeker → 401 (wrong portal)", async () =>
        expect((await call([`jp_seeker_at=${seeker.access}`])).status).toBe(401));
      it("unrelated recruiter → 404 (no existence oracle)", async () =>
        expect((await call([`jp_recruiter_at=${rival.access}`])).status).toBe(404));
      it("owner → 200", async () =>
        expect((await call([`jp_recruiter_at=${owner.access}`])).status).toBe(200));
    });
  }

  it("update without a file updates fields and keeps the logo untouched", async () => {
    const companyId = (await createCompany(owner.access)).body.company.id;
    const res = await request(app)
      .put(`/api/v1/company/update/${companyId}`)
      .set("Cookie", [`jp_recruiter_at=${owner.access}`])
      .field("description", "We build things");
    expect(res.status).toBe(200);
    expect(res.body.company.description).toBe("We build things");
  });

  it("malformed :id → 400, unknown-but-wellformed :id → 404", async () => {
    const c = (cookie: string, id: string) =>
      request(app).get(`/api/v1/company/get/${id}`).set("Cookie", [cookie]);
    expect((await c(`jp_recruiter_at=${owner.access}`, "nope")).status).toBe(400);
    expect((await c(`jp_recruiter_at=${owner.access}`, "64b0c8f2a9d3e45f6a7b8c9d")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- company` → FAIL (DTO shape, matrix statuses).

- [ ] **Step 3: Implement**

`backend/src/services/company.service.ts`:

```ts
import type { HydratedDocument } from "mongoose";
import type { CompanyCreateBody, CompanyDto, CompanyUpdateBody } from "@jobportal/shared";
import { Company, type CompanyDocument } from "../models/company.model.js";
import { AppError } from "../lib/AppError.js";
import getDataUri from "../utils/datauri.js";
import { getCloudinary } from "../utils/cloudinary.js";

const notFound = () => AppError.notFound("COMPANY_NOT_FOUND", "Company not found");

export function toCompanyDto(doc: HydratedDocument<CompanyDocument>): CompanyDto {
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description ?? null,
    website: doc.website ?? null,
    location: doc.location ?? null,
    logoUrl: doc.logo ?? null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
}

export async function createCompany(ownerId: string, body: CompanyCreateBody): Promise<CompanyDto> {
  try {
    const company = await Company.create({ name: body.name, userId: ownerId });
    return toCompanyDto(company);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict("COMPANY_EXISTS", "You already registered a company with this name");
    }
    throw err;
  }
}

export async function listCompanies(ownerId: string): Promise<CompanyDto[]> {
  const companies = await Company.find({ userId: ownerId }).sort({ createdAt: -1 });
  return companies.map(toCompanyDto);
}

/** Missing and foreign are indistinguishable by design: both 404. */
async function findOwned(ownerId: string, companyId: string) {
  const company = await Company.findOne({ _id: companyId, userId: ownerId });
  if (!company) throw notFound();
  return company;
}

export async function getOwnedCompany(ownerId: string, companyId: string): Promise<CompanyDto> {
  return toCompanyDto(await findOwned(ownerId, companyId));
}

export async function assertCompanyOwned(ownerId: string, companyId: string): Promise<void> {
  await findOwned(ownerId, companyId);
}

export async function updateCompany(
  ownerId: string,
  companyId: string,
  body: CompanyUpdateBody,
  logo?: Express.Multer.File,
): Promise<CompanyDto> {
  const company = await findOwned(ownerId, companyId);
  if (body.name !== undefined) company.name = body.name;
  if (body.description !== undefined) company.description = body.description;
  if (body.website !== undefined) company.website = body.website;
  if (body.location !== undefined) company.location = body.location;
  if (logo) {
    const upload = await getCloudinary().uploader.upload(getDataUri(logo).content as string);
    company.logo = upload.secure_url;
  }
  try {
    await company.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict("COMPANY_EXISTS", "You already registered a company with this name");
    }
    throw err;
  }
  return toCompanyDto(company);
}
```

`backend/src/controllers/company.controller.ts` (full rewrite):

```ts
import type { Request, Response } from "express";
import {
  companyCreateBodySchema,
  companyUpdateBodySchema,
  objectIdSchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as companyService from "../services/company.service.js";

export const registerCompany = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(companyCreateBodySchema, req.body);
  const company = await companyService.createCompany(req.auth!.id, body);
  res.status(201).json({ success: true, company });
};

export const getCompany = async (req: Request, res: Response): Promise<void> => {
  const companies = await companyService.listCompanies(req.auth!.id);
  res.status(200).json({ success: true, companies });
};

export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const company = await companyService.getOwnedCompany(req.auth!.id, id);
  res.status(200).json({ success: true, company });
};

export const updateCompany = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const body = parseBody(companyUpdateBodySchema, req.body);
  const company = await companyService.updateCompany(
    req.auth!.id,
    id,
    body,
    req.file as Express.Multer.File | undefined,
  );
  res.status(200).json({ success: true, company });
};
```

`backend/src/routes/company.route.ts`:

```ts
import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  registerCompany,
  getCompany,
  getCompanyById,
  updateCompany,
} from "../controllers/company.controller.js";
import { logoUpload } from "../middleware/multer.js";

const router = express.Router();

router.route("/register").post(authenticate("recruiter"), registerCompany);
router.route("/get").get(authenticate("recruiter"), getCompany);
router.route("/get/:id").get(authenticate("recruiter"), getCompanyById);
router.route("/update/:id").put(authenticate("recruiter"), logoUpload, updateCompany);

export default router;
```

Also: routes need `express.json()` — check `applySecurity`/`app.ts`; the auth router mounts its own body parsing (see how `auth.route.ts` does it) and mirror that. If `buildApp` has no global `express.json()`, add `router.use(express.json())` at the top of this router (and the job/application routers in Tasks 5–6) exactly as `auth.route.ts` does.

- [ ] **Step 4: Run** — `npm test --workspace @jobportal/api -- company` → PASS. Full suite → PASS.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api)!: rebuild company module with ownership checks and DTOs"`

---

### Task 5: Job module rebuild

**Files:**
- Create: `backend/src/services/job.service.ts`
- Rewrite: `backend/src/controllers/job.controller.ts`, `backend/src/routes/job.route.ts`
- Test: `backend/tests/job.test.ts` (also update `backend/tests/auth/publicJobs.test.ts` for the new list envelope)

**Interfaces:**
- Consumes: `assertCompanyOwned`, `toCompanyDto` (Task 4), Task 1 schemas, `escapeRegex` (Task 2), `optionalAuthenticate` (Task 3).
- Produces (used by application service in Task 6):
  - `createJob(ownerId: string, body: JobCreateBody): Promise<JobDto>`
  - `listPublicJobs(query: JobListQuery): Promise<PaginatedResponse<JobDto>>`
  - `getPublicJob(jobId: string): Promise<JobDto>` (404 `JOB_NOT_FOUND`)
  - `listOwnedJobs(ownerId: string, query: PaginationQuery): Promise<PaginatedResponse<JobDto>>`
  - `assertJobOwned(ownerId: string, jobId: string): Promise<void>` (404 `JOB_NOT_FOUND` missing/foreign)
  - `jobExists(jobId: string): Promise<boolean>`
  - `toJobDto(doc): JobDto` (company populated or null)

- [ ] **Step 1: Write failing tests** — `backend/tests/job.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function recruiterWithCompany(email: string) {
  const session = await signedUpOn("recruiter", email);
  const res = await request(app)
    .post("/api/v1/company/register")
    .set("Cookie", [`jp_recruiter_at=${session.access}`])
    .send({ name: `Co-${email}` });
  return { ...session, companyId: res.body.company.id as string };
}

function jobBody(companyId: string, title = "TypeScript Dev") {
  return {
    title, description: "Build the portal", requirements: "ts,node",
    salary: 10, experience: 2, location: "Remote", jobType: "full-time",
    position: "2", companyId,
  };
}

describe("job routes", () => {
  let owner: Awaited<ReturnType<typeof recruiterWithCompany>>;
  let rival: Awaited<ReturnType<typeof recruiterWithCompany>>;

  beforeEach(async () => {
    installCaptureMailer();
    owner = await recruiterWithCompany("owner@example.com");
    rival = await recruiterWithCompany("rival@example.com");
  });

  it("posts a job against an owned company", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`])
      .send(jobBody(owner.companyId));
    expect(res.status).toBe(201);
    expect(res.body.job.company.name).toBe("Co-owner@example.com");
    expect(res.body.job._id).toBeUndefined();
  });

  it("404s posting a job against someone else's company", async () => {
    const res = await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${rival.access}`])
      .send(jobBody(owner.companyId));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("COMPANY_NOT_FOUND");
  });

  it("public list is paginated and filters by escaped keyword", async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/job/post")
        .set("Cookie", [`jp_recruiter_at=${owner.access}`])
        .send(jobBody(owner.companyId, `Dev ${i}`));
    }
    const res = await request(app).get("/api/v1/job/get?limit=2&keyword=dev");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body).toMatchObject({ total: 3, page: 1, pages: 2 });

    // Hostile regex input matches literally instead of exploding or matching all.
    const hostile = await request(app).get(`/api/v1/job/get?keyword=${encodeURIComponent("(a+)+$")}`);
    expect(hostile.status).toBe(200);
    expect(hostile.body.total).toBe(0);
  });

  it("getadminjobs matrix: anonymous 401, seeker 401, recruiter sees only own", async () => {
    await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`])
      .send(jobBody(owner.companyId));
    expect((await request(app).get("/api/v1/job/getadminjobs")).status).toBe(401);
    const seeker = await signedUpOn("seeker", "s@example.com");
    expect(
      (await request(app).get("/api/v1/job/getadminjobs").set("Cookie", [`jp_seeker_at=${seeker.access}`])).status,
    ).toBe(401);
    const mine = await request(app)
      .get("/api/v1/job/getadminjobs")
      .set("Cookie", [`jp_recruiter_at=${rival.access}`]);
    expect(mine.body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- job` (not `publicJobs`) → FAIL.

- [ ] **Step 3: Implement**

`backend/src/services/job.service.ts`:

```ts
import type { HydratedDocument } from "mongoose";
import type {
  JobCreateBody,
  JobDto,
  JobListQuery,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Job, type JobDocument } from "../models/job.model.js";
import type { CompanyDocument } from "../models/company.model.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { assertCompanyOwned, toCompanyDto } from "./company.service.js";

const notFound = () => AppError.notFound("JOB_NOT_FOUND", "Job not found");

// After populate("company") the field is a document, not an ObjectId.
type PopulatedJob = Omit<HydratedDocument<JobDocument>, "company"> & {
  company: HydratedDocument<CompanyDocument> | null;
};

export function toJobDto(doc: PopulatedJob): JobDto {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    requirements: doc.requirements ?? [],
    salary: doc.salary,
    experienceLevel: doc.experienceLevel,
    location: doc.location,
    jobType: doc.jobType,
    position: doc.position,
    company: doc.company ? toCompanyDto(doc.company) : null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
}

export async function createJob(ownerId: string, body: JobCreateBody): Promise<JobDto> {
  // Throws 404 COMPANY_NOT_FOUND when the company is missing OR foreign —
  // this is the ownership check the old controller lacked.
  await assertCompanyOwned(ownerId, body.companyId);
  const job = await Job.create({
    title: body.title,
    description: body.description,
    requirements: body.requirements,
    salary: body.salary,
    experienceLevel: body.experience,
    location: body.location,
    jobType: body.jobType,
    position: body.position,
    company: body.companyId,
    created_by: ownerId,
  });
  const populated = (await job.populate("company")) as unknown as PopulatedJob;
  return toJobDto(populated);
}

async function paginate(
  filter: Record<string, unknown>,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<JobDto>> {
  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ company: HydratedDocument<CompanyDocument> | null }>("company"),
  ]);
  return {
    items: jobs.map((j) => toJobDto(j as unknown as PopulatedJob)),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function listPublicJobs(query: JobListQuery): Promise<PaginatedResponse<JobDto>> {
  const filter: Record<string, unknown> = {};
  if (query.keyword) {
    // A RegExp VALUE (not an {$regex} object) survives sanitizeFilter, and the
    // escape makes hostile input match literally instead of as a pattern.
    const re = new RegExp(escapeRegex(query.keyword), "i");
    filter.$or = [{ title: re }, { description: re }];
  }
  return paginate(filter, query);
}

export async function getPublicJob(jobId: string): Promise<JobDto> {
  const job = await Job.findById(jobId).populate<{
    company: HydratedDocument<CompanyDocument> | null;
  }>("company");
  if (!job) throw notFound();
  return toJobDto(job as unknown as PopulatedJob);
}

export async function listOwnedJobs(
  ownerId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<JobDto>> {
  return paginate({ created_by: ownerId }, query);
}

export async function assertJobOwned(ownerId: string, jobId: string): Promise<void> {
  const job = await Job.findOne({ _id: jobId, created_by: ownerId }).select("_id");
  if (!job) throw notFound();
}

export async function jobExists(jobId: string): Promise<boolean> {
  return (await Job.exists({ _id: jobId })) !== null;
}
```

NOTE: `filter.$or` here is service-constructed (the RegExp comes from escaped input) — with `sanitizeFilter` on (Task 8), a top-level `$or` in a filter built by our own code is still allowed only when wrapped; **when Task 8 lands, wrap this**: `Job.find(query.keyword ? mongoose.trusted(filter) : filter)`. Simpler and done now: build with `mongoose.trusted` immediately — import `mongoose` and in `listPublicJobs` return `paginate(query.keyword ? (mongoose.trusted(filter) as Record<string, unknown>) : {}, query)`. Do it now so Task 8 flips cleanly.

`backend/src/controllers/job.controller.ts` (full rewrite):

```ts
import type { Request, Response } from "express";
import {
  jobCreateBodySchema,
  jobListQuerySchema,
  objectIdSchema,
  paginationQuerySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as jobService from "../services/job.service.js";

export const postJob = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(jobCreateBodySchema, req.body);
  const job = await jobService.createJob(req.auth!.id, body);
  res.status(201).json({ success: true, job });
};

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(jobListQuerySchema, req.query);
  const result = await jobService.listPublicJobs(query);
  res.status(200).json({ success: true, ...result });
};

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const job = await jobService.getPublicJob(id);
  res.status(200).json({ success: true, job });
};

export const getAdminJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await jobService.listOwnedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};
```

`backend/src/routes/job.route.ts`:

```ts
import express from "express";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { postJob, getAllJobs, getJobById, getAdminJobs } from "../controllers/job.controller.js";

const router = express.Router();

router.route("/post").post(authenticate("recruiter"), postJob);
// Public: the job board is the product's front door. `optionalAuthenticate`
// still resolves a session when one is present.
router.route("/get").get(optionalAuthenticate(), getAllJobs);
router.route("/get/:id").get(optionalAuthenticate(), getJobById);
router.route("/getadminjobs").get(authenticate("recruiter"), getAdminJobs);

export default router;
```

Update `backend/tests/auth/publicJobs.test.ts`: assertions on `res.body.jobs` become `res.body.items` (+ envelope fields); everything else stands.

- [ ] **Step 4: Run** — `npm test --workspace @jobportal/api -- job` and `-- publicJobs` → PASS. Full suite → PASS.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api)!: rebuild job module with company ownership, safe search, pagination"`

---

### Task 6: Application module rebuild

**Files:**
- Create: `backend/src/services/application.service.ts`
- Rewrite: `backend/src/controllers/application.controller.ts`, `backend/src/routes/application.route.ts`
- Test: `backend/tests/application.test.ts`

**Interfaces:**
- Consumes: `jobExists`, `assertJobOwned`, `toJobDto` (Task 5), Task 1 schemas/DTOs. Models: `Application` (own), `Job`/`Seeker` **only through populate refs** — never import another module's model directly; job checks go through the job service.
- Produces:
  - `applyToJob(seekerId: string, jobId: string): Promise<void>` (404 `JOB_NOT_FOUND`; 409 `ALREADY_APPLIED` from the unique index)
  - `listAppliedJobs(seekerId: string, query: PaginationQuery): Promise<PaginatedResponse<AppliedJobDto>>`
  - `listApplicants(recruiterId: string, jobId: string, query: PaginationQuery): Promise<PaginatedResponse<ApplicantDto>>` (404 on missing/foreign job)
  - `decideApplication(recruiterId: string, applicationId: string, status: "accepted" | "rejected"): Promise<void>` (404 `APPLICATION_NOT_FOUND` on missing or foreign-job application)
- **Route change:** `GET /apply/:id` becomes **`POST /apply/:id`** (state mutation on GET is CSRF-able and crawler-triggerable).

- [ ] **Step 1: Write failing tests** — `backend/tests/application.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

describe("application routes", () => {
  let recruiter: { access: string };
  let rival: { access: string };
  let seeker: { access: string };
  let jobId: string;

  beforeEach(async () => {
    installCaptureMailer();
    recruiter = await signedUpOn("recruiter", "r@example.com");
    rival = await signedUpOn("recruiter", "rival@example.com");
    seeker = await signedUpOn("seeker", "s@example.com");
    const company = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
      .send({ name: "Acme" });
    const job = await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
      .send({
        title: "Dev", description: "Build", requirements: "ts", salary: 10,
        experience: 1, location: "Remote", jobType: "full-time", position: "1",
        companyId: company.body.company.id,
      });
    jobId = job.body.job.id;
  });

  const apply = (cookies: string[]) =>
    request(app).post(`/api/v1/application/apply/${jobId}`).set("Cookie", cookies);

  it("GET /apply/:id no longer exists (mutating GET removed)", async () => {
    const res = await request(app)
      .get(`/api/v1/application/apply/${jobId}`)
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(404);
  });

  it("POST apply matrix: anonymous 401, recruiter 401, seeker 201", async () => {
    expect((await apply([])).status).toBe(401);
    expect((await apply([`jp_recruiter_at=${recruiter.access}`])).status).toBe(401);
    expect((await apply([`jp_seeker_at=${seeker.access}`])).status).toBe(201);
  });

  it("duplicate apply → 409, including under a parallel race", async () => {
    const results = await Promise.all([
      apply([`jp_seeker_at=${seeker.access}`]),
      apply([`jp_seeker_at=${seeker.access}`]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await apply([`jp_seeker_at=${seeker.access}`])).status).toBe(409);
  });

  it("seeker's applied list is an enveloped DTO", async () => {
    await apply([`jp_seeker_at=${seeker.access}`]);
    const res = await request(app)
      .get("/api/v1/application/get")
      .set("Cookie", [`jp_seeker_at=${seeker.access}`]);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ status: "pending" });
    expect(res.body.items[0].job.title).toBe("Dev");
    expect(res.body.items[0]._id).toBeUndefined();
  });

  describe("applicants + status, ownership matrix", () => {
    let applicationId: string;
    beforeEach(async () => {
      await apply([`jp_seeker_at=${seeker.access}`]);
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      applicationId = list.body.items[0].applicationId;
    });

    it("owner sees the ApplicantDto and nothing more", async () => {
      const res = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`]);
      const applicant = res.body.items[0];
      expect(applicant).toMatchObject({ fullName: "Signed Up", email: "s@example.com" });
      expect(applicant.passwordHash).toBeUndefined();
      expect(applicant.googleId).toBeUndefined();
      expect(applicant.status).toBe("pending");
    });

    it("unrelated recruiter → 404 on applicants and on status update", async () => {
      const list = await request(app)
        .get(`/api/v1/application/${jobId}/applicants`)
        .set("Cookie", [`jp_recruiter_at=${rival.access}`]);
      expect(list.status).toBe(404);
      const upd = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${rival.access}`])
        .send({ status: "accepted" });
      expect(upd.status).toBe(404);
    });

    it("owner updates status; garbage status is a 400, not a 500", async () => {
      const bad = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
        .send({ status: { $gt: "" } });
      expect(bad.status).toBe(400);
      const ok = await request(app)
        .post(`/api/v1/application/status/${applicationId}/update`)
        .set("Cookie", [`jp_recruiter_at=${recruiter.access}`])
        .send({ status: "accepted" });
      expect(ok.status).toBe(200);
    });

    it("anonymous and seeker cannot reach recruiter application routes", async () => {
      expect((await request(app).get(`/api/v1/application/${jobId}/applicants`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/v1/application/${jobId}/applicants`)
            .set("Cookie", [`jp_seeker_at=${seeker.access}`])
        ).status,
      ).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- application` → FAIL.

- [ ] **Step 3: Implement**

`backend/src/services/application.service.ts`:

```ts
import type { HydratedDocument } from "mongoose";
import type {
  ApplicantDto,
  AppliedJobDto,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { Application, type ApplicationDocument } from "../models/application.model.js";
import { AppError } from "../lib/AppError.js";
import { assertJobOwned, jobExists, toJobDto } from "./job.service.js";

export async function applyToJob(seekerId: string, jobId: string): Promise<void> {
  if (!(await jobExists(jobId))) {
    throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  }
  try {
    await Application.create({ job: jobId, applicant: seekerId });
  } catch (err) {
    // The unique {job, applicant} index is the dedupe — no findOne pre-read,
    // so two parallel applies cannot both succeed.
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict("ALREADY_APPLIED", "You have already applied for this job");
    }
    throw err;
  }
}

export async function listAppliedJobs(
  seekerId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<AppliedJobDto>> {
  const filter = { applicant: seekerId };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "job", populate: { path: "company" } }),
  ]);
  return {
    items: applications.map((a) => ({
      id: String(a._id),
      status: a.status as AppliedJobDto["status"],
      appliedAt: (a as { createdAt?: Date }).createdAt?.toISOString() ?? "",
      // populated job (or null if the job was deleted since)
      job: a.job && typeof a.job === "object" && "title" in a.job ? toJobDto(a.job as never) : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

type PopulatedApplicant = HydratedDocument<ApplicationDocument> & {
  applicant: {
    fullName: string;
    email: string;
    phone: string | null;
    profile?: { headline?: string | null; skills?: string[] } | null;
    resume?: { storageKey?: string | null; originalName?: string | null } | null;
  } | null;
};

export async function listApplicants(
  recruiterId: string,
  jobId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<ApplicantDto>> {
  await assertJobOwned(recruiterId, jobId); // 404 on missing OR foreign
  const filter = { job: jobId };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "applicant",
        select: "fullName email phone profile resume",
      }),
  ]);
  return {
    items: (applications as unknown as PopulatedApplicant[]).map((a) => ({
      applicationId: String(a._id),
      status: a.status as ApplicantDto["status"],
      appliedAt: (a as { createdAt?: Date }).createdAt?.toISOString() ?? "",
      fullName: a.applicant?.fullName ?? "",
      email: a.applicant?.email ?? "",
      phone: a.applicant?.phone ?? null,
      headline: a.applicant?.profile?.headline ?? null,
      skills: a.applicant?.profile?.skills ?? [],
      resumeUrl: a.applicant?.resume?.storageKey ?? null, // becomes a signed URL in Task 7
      resumeName: a.applicant?.resume?.originalName ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function decideApplication(
  recruiterId: string,
  applicationId: string,
  status: "accepted" | "rejected",
): Promise<void> {
  const application = await Application.findById(applicationId).select("job status");
  if (!application) throw AppError.notFound("APPLICATION_NOT_FOUND", "Application not found");
  // Foreign application → same 404 as missing (assertJobOwned throws JOB_NOT_FOUND;
  // normalize to the application's own code so the two cases are indistinguishable).
  try {
    await assertJobOwned(recruiterId, String(application.job));
  } catch {
    throw AppError.notFound("APPLICATION_NOT_FOUND", "Application not found");
  }
  application.status = status;
  await application.save();
}
```

`backend/src/controllers/application.controller.ts` (full rewrite):

```ts
import type { Request, Response } from "express";
import {
  applicationStatusBodySchema,
  objectIdSchema,
  paginationQuerySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as applicationService from "../services/application.service.js";

export const applyJob = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.id);
  await applicationService.applyToJob(req.auth!.id, jobId);
  res.status(201).json({ success: true, message: "Job applied successfully." });
};

export const getAppliedJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await applicationService.listAppliedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};

export const getApplicants = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.id);
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await applicationService.listApplicants(req.auth!.id, jobId, query);
  res.status(200).json({ success: true, ...result });
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  const applicationId = parseBody(objectIdSchema, req.params.id);
  const { status } = parseBody(applicationStatusBodySchema, req.body);
  await applicationService.decideApplication(req.auth!.id, applicationId, status);
  res.status(200).json({ success: true, message: "Status updated successfully." });
};
```

`backend/src/routes/application.route.ts`:

```ts
import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  applyJob,
  getAppliedJobs,
  getApplicants,
  updateStatus,
} from "../controllers/application.controller.js";

const router = express.Router();

// POST, not GET: applying mutates state.
router.route("/apply/:id").post(authenticate("seeker"), applyJob);
router.route("/get").get(authenticate("seeker"), getAppliedJobs);
router.route("/:id/applicants").get(authenticate("recruiter"), getApplicants);
router.route("/status/:id/update").post(authenticate("recruiter"), updateStatus);

export default router;
```

- [ ] **Step 4: Run** — `npm test --workspace @jobportal/api -- application` → PASS. Full suite → PASS (bridge tests still pass because bridgeAuth still exists until Task 8; if any bridge test exercised a domain route that changed shape, update its assertion to the new envelope).

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api)!: rebuild application module — POST apply, applicant DTO, ownership"`

---

### Task 7: Authenticated resume storage + signed URLs + profile validation

**Files:**
- Create: `backend/src/services/resume.service.ts`
- Modify: `backend/src/controllers/user.controller.ts`, `backend/src/routes/user.route.ts`, `backend/src/services/application.service.ts` (resumeUrl signing), `packages/shared` profile schema (add `profileUpdateBodySchema` to `domain.ts`)
- Test: `backend/tests/auth/profile.test.ts` (extend), `backend/tests/application.test.ts` (extend)

**Interfaces:**
- Produces:
  - `uploadResume(file: Express.Multer.File): Promise<{ storageKey: string }>` — uploads with `{ type: "authenticated", resource_type: "raw" }` and returns the **public_id** (never a URL).
  - `signedResumeUrl(storageKey: string | null): string | null` — for legacy rows that still hold a full `https://` URL, returns it unchanged; for a public_id, returns a Cloudinary signed authenticated URL.
  - `profileUpdateBodySchema` in shared: `{ fullname?: string 2–80 trimmed, phoneNumber?: string max 20, bio?: string max 1000, skills?: string max 500 (comma string → string[] transform) }`.
- `user.route.ts` moves `bridgeAuth("any")` → `authenticateAny()` (Task 3) and `singleUpload` → `resumeUpload` (done in Task 2).

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/auth/profile.test.ts` (mock Cloudinary the way the suite mocks the mailer — module-level `vi.mock`):

```ts
import { vi } from "vitest";

vi.mock("../../src/utils/cloudinary.js", () => ({
  getCloudinary: () => ({
    uploader: {
      upload: vi.fn(async (_content: string, opts?: Record<string, unknown>) => ({
        secure_url: "https://res.cloudinary.com/test/raw/authenticated/resume.pdf",
        public_id: "resumes/abc123",
        ...(opts ?? {}),
      })),
    },
    utils: {
      private_download_url: vi.fn(
        (publicId: string) => `https://res.cloudinary.com/signed/${publicId}?sig=x`,
      ),
    },
  }),
}));

// New cases:
it("stores the public_id and returns a signed resume URL, never the raw key", async () => {
  // ...sign up a seeker via helpers, then:
  const res = await request(app)
    .post("/api/v1/user/profile/update")
    .set("Cookie", [`jp_seeker_at=${access}`])
    .attach("file", Buffer.from("%PDF-1.4 fake"), { filename: "cv.pdf", contentType: "application/pdf" })
    .field("bio", "hello");
  expect(res.status).toBe(200);
  expect(res.body.profile.seeker.resumeUrl).toContain("sig=");
  expect(res.body.profile.seeker.resumeUrl).not.toContain("resumes/abc123?"); // not the bare key
});

it("rejects a non-PDF resume with 400 UNSUPPORTED_FILE_TYPE", async () => {
  const res = await request(app)
    .post("/api/v1/user/profile/update")
    .set("Cookie", [`jp_seeker_at=${access}`])
    .attach("file", Buffer.from("GIF89a"), { filename: "cv.gif", contentType: "image/gif" });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
});

it("rejects an operator-shaped profile body with 400", async () => {
  const res = await request(app)
    .post("/api/v1/user/profile/update")
    .set("Cookie", [`jp_seeker_at=${access}`])
    .send({ fullname: { $gt: "" } });
  expect(res.status).toBe(400);
});
```

In `backend/tests/application.test.ts`, extend the applicants-DTO case: after the seeker uploads a resume (same mock), assert `items[0].resumeUrl` contains `sig=`.

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- profile` → FAIL.

- [ ] **Step 3: Implement**

Add to `packages/shared/src/domain.ts` (then rebuild shared):

```ts
export const profileUpdateBodySchema = z.object({
  fullname: z.string().trim().min(2).max(80).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  bio: z.string().trim().max(1000).optional(),
  skills: z
    .string()
    .max(500)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
    .optional(),
});
export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;
```

`backend/src/services/resume.service.ts`:

```ts
import { getCloudinary } from "../utils/cloudinary.js";
import getDataUri from "../utils/datauri.js";

/**
 * Resumes are PII. They upload as `authenticated` raw assets, we persist only
 * the public_id, and every read mints a signed URL. The old flow stored a
 * permanent public secure_url — unguessable, but live forever for anyone who
 * ever saw it.
 */
export async function uploadResume(file: Express.Multer.File): Promise<{ storageKey: string }> {
  const upload = await getCloudinary().uploader.upload(getDataUri(file).content as string, {
    type: "authenticated",
    resource_type: "raw",
    folder: "resumes",
  });
  return { storageKey: upload.public_id };
}

export function signedResumeUrl(storageKey: string | null): string | null {
  if (!storageKey) return null;
  // Legacy rows (pre-1C dev data) stored the full public URL; pass through.
  if (storageKey.startsWith("http")) return storageKey;
  return getCloudinary().utils.private_download_url(storageKey, "pdf", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 600, // 10 minutes
  });
}
```

`user.controller.ts` changes:
- `toProfileView`: `resumeUrl: signedResumeUrl(seeker.resume!.storageKey ?? null)`.
- `updateProfile`: replace the destructure + ad-hoc `if`s with `const body = parseBody(profileUpdateBodySchema, req.body);` then `if (body.fullname !== undefined) account.fullName = body.fullname;` etc. (`skills` is already `string[]` after the transform). Replace the inline upload block with:

```ts
const file = req.file as Express.Multer.File | undefined;
if (file) {
  const { storageKey } = await uploadResume(file);
  seeker.resume!.storageKey = storageKey;
  seeker.resume!.originalName = file.originalname;
  seeker.resume!.mimeType = file.mimetype;
  seeker.resume!.sizeBytes = file.size;
  seeker.resume!.uploadedAt = new Date();
}
```

`user.route.ts`: swap `bridgeAuth("any")` for `authenticateAny()` on both routes (keep paths unchanged).

`application.service.ts`: import `signedResumeUrl` and change the applicants mapping line to `resumeUrl: signedResumeUrl(a.applicant?.resume?.storageKey ?? null),`.

- [ ] **Step 4: Run** — `-- profile`, `-- application`, then full suite → PASS.

- [ ] **Step 5: Commit** — `git add backend packages/shared && git commit -m "feat(api): authenticated resume storage with signed URLs, validated profile updates"`

---

### Task 8: Delete bridgeAuth/req.id, flip sanitizeFilter on

**Files:**
- Delete: `backend/src/middleware/bridgeAuth.ts`
- Modify: `backend/src/types/express.d.ts` (remove `id`), `backend/src/config/db.ts`, `backend/tests/setup.ts`, `backend/src/models/authFields.ts` (comment), and wrap trusted operator queries in: `backend/src/services/session.service.ts:112`, `backend/src/lib/sweeper.ts:40`, `backend/src/services/googleAuth.service.ts:262`, `backend/src/services/auth.service.ts:146,149,457,458`
- Test: `backend/tests/auth/bridge.test.ts` (delete or gut — see step 3), full suite as the regression net

**Interfaces:**
- Consumes: nothing new. Produces: none — this is teardown. After this task `grep -r "req\.id\b\|bridgeAuth" backend/src` returns nothing.

- [ ] **Step 1: Write the failing check**

`sanitizeFilter` first, test-driven: add to `backend/tests/models.test.ts`:

```ts
it("sanitizeFilter strips operator-shaped values in untrusted filters", async () => {
  const { Company } = await import("../src/models/company.model.js");
  const { Types } = await import("mongoose");
  await Company.create({ name: "Filter Co", userId: new Types.ObjectId() });
  // An injected operator must match nothing instead of matching everything.
  const hit = await Company.findOne({ name: { $ne: "" } as unknown as string });
  expect(hit).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @jobportal/api -- models` → FAIL (`hit` is a document while sanitizeFilter is off).

- [ ] **Step 3: Implement**

1. `backend/src/config/db.ts` — before `mongoose.connect(uri)` add:

```ts
// Injection backstop behind Zod: operator-shaped VALUES in filters are treated
// as literals unless a query opts in with mongoose.trusted().
mongoose.set("sanitizeFilter", true);
```

2. `backend/tests/setup.ts` — same `mongoose.set("sanitizeFilter", true);` line immediately before `mongoose.connect` in `beforeAll` (tests bypass `config/db.ts`).
3. Wrap every legitimate operator VALUE in `mongoose.trusted(...)` (import `mongoose` in each file). sanitizeFilter only strips operators in filter *values*, so only these need wrapping (top-level `$or` in the Google-link query at `googleAuth.service.ts` area is unaffected unless it's a value — check each):
   - `session.service.ts:112`: `expiresAt: mongoose.trusted({ $gt: new Date() })`
   - `sweeper.ts:40`: `createdAt: mongoose.trusted({ $lt: cutoff })`
   - `googleAuth.service.ts:262`: `"pendingGoogleLink.requestedAt": mongoose.trusted({ $gt: cutoff })`
   - `auth.service.ts:146`: `expiresAt: mongoose.trusted({ $gt: new Date() })`
   - `auth.service.ts:149`: `attempts: mongoose.trusted({ $lt: env().OTP_MAX_ATTEMPTS })`
   - `auth.service.ts:457-458`: same two wraps
   - `job.service.ts`: already built with `mongoose.trusted` in Task 5.
4. Delete `backend/src/middleware/bridgeAuth.ts`. Nothing imports it anymore (Tasks 4–7 moved every route). Verify: `grep -r "bridgeAuth" backend/src` → empty.
5. `express.d.ts`: delete the whole `id?: string;` member and its comment; update the `auth` docblock to drop the bridgeAuth mention.
6. `authFields.ts`: rewrite the NOTE block: sanitizeFilter is now ON; explicit projection remains good practice; `mongoose.trusted` marks the deliberate operator queries.
7. `backend/tests/auth/bridge.test.ts`: the file tests a deleted middleware. Keep any case that asserts a *legacy `token` cookie is rejected by the modern routes* (re-point it at a rebuilt domain route, e.g. GET `/api/v1/company/get` with only `token=...` → 401); delete the rest of the file.

- [ ] **Step 4: Run** — full suite `npm test --workspace @jobportal/api` AND `npm run typecheck`. Auth flows (login/refresh/OTP/reset/google/sweeper tests) are the canary for an over-aggressive sanitizeFilter — if one fails, a trusted() wrap was missed; the failing test names the flow.
Expected: all PASS.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api)!: delete bridgeAuth and req.id; enable global sanitizeFilter"`

---

### Task 9: Drop the legacy `users` collection

**Files:**
- Create: `backend/src/scripts/migrate-phase1c.ts`
- Modify: `backend/package.json` (add script `"migrate:phase1c": "tsx src/scripts/migrate-phase1c.ts"` — match how existing backend scripts invoke TS; if the repo pattern is `node --loader` or a build step, mirror the `dev:api` script's runner)
- Test: `backend/tests/migration-phase1c.test.ts`

**Interfaces:** standalone script; exports `dropLegacyUsersCollection(): Promise<{ dropped: boolean }>` so the test can call it without spawning a process.

- [ ] **Step 1: Write failing test**

```ts
// backend/tests/migration-phase1c.test.ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { dropLegacyUsersCollection } from "../src/scripts/migrate-phase1c.js";

describe("phase 1C migration", () => {
  it("drops users when present and is a no-op when absent", async () => {
    await mongoose.connection.db!.collection("users").insertOne({ legacy: true });
    expect((await dropLegacyUsersCollection()).dropped).toBe(true);
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain("users");
    expect((await dropLegacyUsersCollection()).dropped).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `-- migration-phase1c` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// backend/src/scripts/migrate-phase1c.ts
import mongoose from "mongoose";
import { env } from "../config/env.js";

/**
 * Phase 1C teardown: the legacy `users` collection lost its model and last
 * reader in 1B; this removes the data. Run once, manually:
 *   npm run migrate:phase1c --workspace @jobportal/api
 */
export async function dropLegacyUsersCollection(): Promise<{ dropped: boolean }> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("connect to Mongo before calling this");
  const exists = (await db.listCollections({ name: "users" }).toArray()).length > 0;
  if (!exists) return { dropped: false };
  await db.dropCollection("users");
  return { dropped: true };
}

// Invoked directly (not imported by a test): connect, drop, report, exit.
if (process.argv[1]?.endsWith("migrate-phase1c.ts") || process.argv[1]?.endsWith("migrate-phase1c.js")) {
  const uri = env().MONGO_URI;
  await mongoose.connect(uri);
  const result = await dropLegacyUsersCollection();
  console.log(result.dropped ? "dropped legacy users collection" : "nothing to drop");
  await mongoose.disconnect();
}
```

- [ ] **Step 4: Run** — `-- migration-phase1c` → PASS. `npm run typecheck` → PASS.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat(api): phase 1C migration — drop the legacy users collection"`

---

### Task 10: Frontend mechanical updates

**Files (all under `frontend/src`):**
- Modify: `components/JobDescription.tsx` (apply GET→POST, `/job/get/:id` unchanged), `hooks/useGetAllJobs.tsx`, `hooks/useGetAppliedJobs.tsx`, `hooks/useGetAllAdminJobs.tsx`, `hooks/useGetAllCompanies.tsx`, `hooks/useGetCompanyById.tsx`, `components/admin/Applicants.tsx`, `components/admin/ApplicantsTable.tsx`, `components/admin/CompanyCreate.tsx` (`companyName` → `name`), `components/admin/CompanySetup.tsx`, `redux/applicationSlice.ts` and any `LegacyJob`/`LegacyApplication` types (in `packages/shared/src/legacy-dto.ts` or local types — follow the imports)

**Interfaces:**
- Consumes: the new response shapes — lists are `{ success, items, total, page, pages }`; single resources are `{ success, company | job }` DTOs with `id` (NOT `_id`), `logoUrl` (not `logo`); applicants are `ApplicantDto[]`; company register body is `{ name }`.

There is no frontend test runner (known gap). Verification for this task is: `npm run typecheck` + `npm run build --workspace` for the frontend package (use the workspace name from `frontend/package.json`), driven by the type swap.

- [ ] **Step 1: Swap the types first** — point the affected hooks/slices at `JobDto`, `CompanyDto`, `ApplicantDto`, `AppliedJobDto`, `PaginatedResponse` from `@jobportal/shared` (replacing `LegacyJob`/`LegacyApplication` usages for these five surfaces only — auth/profile types are 1B's and stay). Run `npm run typecheck`; the compile errors are the worklist. Expect roughly: `.jobs` → `.items`, `.companies` stays (kept as an array response), `job._id` → `job.id`, `company.logo` → `company.logoUrl`, applicant field flattening in `ApplicantsTable` (`item.applicant.profile...` → `item.headline`, `item.fullName`, `item.resumeUrl`, `item.applicationId` for the status call).

- [ ] **Step 2: Behavioral edits (each is small and exact):**
  - `JobDescription.tsx:25`: `apiClient.get(`/application/apply/${jobId}`)` → `apiClient.post(`/application/apply/${jobId}`)` (empty body). Line 68's applied-check maps over `res.data.items` and compares `a.job?.id === jobId`.
  - `CompanyCreate.tsx:26`: send `{ name: companyName }`.
  - `Applicants.tsx:22`: response is the envelope; dispatch `res.data.items` into the slice; header count from `res.data.total`.
  - `ApplicantsTable.tsx:26`: status body already `{ status }` — ensure the two buttons send exactly `"accepted"` / `"rejected"` lowercase.
  - List hooks: read `res.data.items` (jobs) — leave pagination UI itself for Phase 2; requesting page 1 default is fine.

- [ ] **Step 3: Verify** — `npm run typecheck` clean, frontend build (`npm run build` for the web workspace) clean, and `npm run ci` at the root green.

- [ ] **Step 4: Commit** — `git add frontend packages && git commit -m "feat(web)!: adopt phase 1C API contracts — POST apply, DTOs, list envelopes"`

---

### Task 11: Docs + final verification

**Files:**
- Modify: `CLAUDE.md` (Current state section), `docs/superpowers/plans/` (this plan's checkboxes if tracked), `ARCHITECTURE.md` if it describes bridgeAuth (grep for "bridgeAuth" in docs/ and update)

- [ ] **Step 1: Rewrite CLAUDE.md "Current state"** — Phases 1A, 1B, **1C** complete. Remove the known-defects list (all fixed: ownership everywhere, applicant DTO, escaped search, signed resume URLs, POST apply). Remove "Still transitional" (bridgeAuth and `req.id` are gone; `sanitizeFilter` is on; `users` collection dropped by `migrate:phase1c`). Add: "Phase 2 (design-system/UI rebuild) not started." Update the Auth convention bullet that mentions bridgeAuth if present, and add a bullet: "Operator queries: any deliberate `$`-operator in a filter value must be wrapped in `mongoose.trusted()` — `sanitizeFilter` is on globally."
- [ ] **Step 2: Full verification** — `npm run ci` at the root (builds shared, typechecks all, runs all tests, builds both apps). Expected: green. Also `grep -rn "bridgeAuth\|req\.id" backend/src frontend/src` → no hits (except `req.requestId` — grep for `req\.id\b` word-boundary).
- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: record phase 1C as built"`

---

## Self-Review (performed at write time)

- **Spec coverage:** contracts→T1; ownership→T4/5/6; DTOs→T1/4/5/6; POST apply + unique index→T2/6; regex escape→T2/5; pagination→T1/5/6; multer limits→T2; signed resumes→T7; authenticateAny/optionalAuthenticate + bridgeAuth deletion + `req.id`→T3/8; sanitizeFilter→T5(note)/T8; Recruiter.company drop + per-recruiter name uniqueness→T2; users collection drop→T9; frontend impact→T10; docs→T11; four-role matrix→T4/5/6 tests. No gaps.
- **Types:** `PaginatedResponse` uses existing `{items,total,page,pages}` (shared/pagination.ts) — controllers spread it, tests assert `pages`, frontend reads `items`. Service names cross-checked: `assertCompanyOwned` (T4→T5), `assertJobOwned`/`jobExists`/`toJobDto` (T5→T6), `signedResumeUrl`/`uploadResume` (T7), `escapeRegex` (T2→T5).
- **Known judgment calls left to the implementer, deliberately:** exact body-parser mounting (mirror `auth.route.ts` — checked in T4 step 3), whether `authenticate()` shares `resolveSession` (T3), Vitest mock hoisting details for Cloudinary (follow the mailer pattern).
