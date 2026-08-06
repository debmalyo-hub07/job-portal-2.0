# Phase 3A — Three-Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `admin` as a third portal, gate recruiter access behind admin approval, and close both paths by which anyone can currently self-provision a recruiter.

**Architecture:** `Portal` widens from a two-value to a three-value Zod enum. Because `accountModel` is a `Record<Portal, Model>` and keys/cookies are derived from the portal string, widening the enum makes every site that needs a third case a **compile error** — that is the intended discovery mechanism. Authorization then splits into two layers: `authenticate` establishes identity and admits `pending`; a new `requireApproved` decides what a pending account may do.

**Tech Stack:** TypeScript (ESM, `moduleResolution: NodeNext`), Express 5, Mongoose 8, Zod, Vitest + Supertest + `mongodb-memory-server` (API), Vitest + React Testing Library + jsdom (web), React 19 + React Router + Tailwind 4.

## Global Constraints

- **ESM `.js` extensions on every relative import** in `backend` and `packages/shared`, even in `.ts` files. `frontend` uses Bundler resolution and must NOT have them.
- **`packages/shared` must be built before the API typechecks against it.** Run `npm run build --workspace @jobportal/shared` after any change there.
- **Errors:** `throw AppError`. Never `res.status(...).json(...)` for a failure. Never `catch` without rethrowing.
- **Responses:** build an explicit DTO. Never serialize a Mongoose document.
- **Config:** call `env()`. Never read `process.env` directly.
- **Portal is always a route literal**, never from a body, query or cookie — backend and frontend alike.
- **Ownership failures answer 404**, never 403. The single deliberate exception this plan introduces is `RECRUITER_PENDING_APPROVAL` (Task 7), which concerns the caller's own account state and discloses nothing about a resource.
- **Operator queries** need `mongoose.trusted({ ... })` because `sanitizeFilter` is global.
- **Frontend colour** comes only from token utilities. No hex, no Tailwind palette colour, no `dark:` override.
- **Frontend spacing** comes from `PageShell` density custom properties. Never hand-tuned.
- **Fraunces (`font-display`) never below 20px**; `text-xl` is the floor.
- **Commit messages:** conventional-commit style, and this repo uses **no `Co-Authored-By` trailer**.
- Run `npm run build --workspace @jobportal/shared && npm run typecheck` before each commit; `npm run ci` takes >120s — run it in the background.

## File Structure

**Created**
- `backend/src/models/admin.model.ts` — the `admins` collection, `authFields` only.
- `backend/src/middleware/requireApproved.ts` — refuses pending recruiters.
- `backend/src/services/approval.service.ts` — pending → active transition.
- `backend/src/routes/admin.route.ts` — admin-only domain routes (approval).
- `backend/src/scripts/seed-admin.ts` — first-admin bootstrap.
- `backend/src/scripts/migrate-phase3a.ts` — grandfather recruiters, drop `users`.
- `docs/adr/0006-three-account-collections.md`
- `backend/tests/auth/admin-portal.test.ts`, `backend/tests/approval.test.ts`
- `frontend/tests/adminPortal.test.tsx`

**Modified**
- `packages/shared/src/auth.ts:3` — `portalSchema` gains `"admin"`.
- `packages/shared/src/auth-dto.ts:4` — `SessionUser` gains `status`.
- `backend/src/models/authFields.ts:33` — `status` enum gains `"pending"`.
- `backend/src/services/account.service.ts:15` — `MODELS` gains `admin`.
- `backend/src/middleware/authenticate.ts:34,89,103` — status relax; `CANDIDATES` documented.
- `backend/src/services/auth.service.ts:~50,~350` — pending on register; status relax.
- `backend/src/services/googleAuth.service.ts:123,134,158` — status relax; stranger branch.
- `backend/src/routes/auth.route.ts:43` — admin omits `/register` and `/google*`.
- `backend/src/app.ts:31` — mount `/api/v1/admin/auth` and `/api/v1/admin`.
- `backend/tests/auth/helpers.ts:66` — `authTestApp` portal list.
- `frontend/src/lib/portal.ts:21`, `frontend/src/lib/portalRoutes.ts`, `frontend/src/index.css`, `frontend/src/App.tsx`, `frontend/src/routes/authRoutes.tsx`, `frontend/src/components/admin/ProtectedRoute.tsx`, `frontend/src/components/auth/Login.tsx:45,60`, `frontend/src/components/auth/AuthComplete.tsx:32`.

---

### Task 1: Widen `Portal` and add the `admins` collection

**Files:**
- Modify: `packages/shared/src/auth.ts:3`
- Create: `backend/src/models/admin.model.ts`
- Modify: `backend/src/services/account.service.ts:1-22`
- Modify: `backend/src/middleware/authenticate.ts:89`
- Modify: `backend/tests/auth/helpers.ts:66`
- Test: `backend/tests/models.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Portal = "seeker" | "recruiter" | "admin"`; `Admin: Model<AdminDocument>`; `AdminDocument`; `accountModel("admin")` returns the Admin model.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/models.test.ts`:

```ts
import { portalSchema } from "@jobportal/shared";
import { Admin } from "../src/models/admin.model.js";
import { accountModel } from "../src/services/account.service.js";

describe("admin portal", () => {
  it("portalSchema accepts all three portals", () => {
    expect(portalSchema.parse("seeker")).toBe("seeker");
    expect(portalSchema.parse("recruiter")).toBe("recruiter");
    expect(portalSchema.parse("admin")).toBe("admin");
  });

  it("rejects an unknown portal", () => {
    expect(portalSchema.safeParse("root").success).toBe(false);
  });

  it("resolves the admin portal to the admins collection", () => {
    expect(accountModel("admin")).toBe(Admin);
    expect(Admin.collection.name).toBe("admins");
  });

  it("an admin carries the shared auth fields", async () => {
    const a = await Admin.create({
      email: "Root@Example.com",
      fullName: "Root Admin",
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });
    expect(a.email).toBe("root@example.com"); // schema lowercases
    expect(a.status).toBe("active");
    expect(a.googleId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- models`
Expected: FAIL — cannot resolve `../src/models/admin.model.js`.

- [ ] **Step 3: Widen the portal enum**

`packages/shared/src/auth.ts:3`:

```ts
export const portalSchema = z.enum(["seeker", "recruiter", "admin"]);
```

- [ ] **Step 4: Create the admin model**

Create `backend/src/models/admin.model.ts`:

```ts
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { authFields, applyAuthIndexes } from "./authFields.js";
import { defineModel } from "./defineModel.js";

/**
 * Admins carry no profile fields of their own. A recruiter has a designation
 * and a seeker has a resume; an admin is an authority, not a participant, so
 * the schema is `authFields` alone. Kept a separate collection rather than a
 * flag on recruiters so the access-token key stays portal-derived — see
 * ADR-0006.
 */
const adminSchema = new Schema({ ...authFields }, { timestamps: true });

applyAuthIndexes(adminSchema);

export type AdminDocument = InferSchemaType<typeof adminSchema>;
export const Admin: Model<AdminDocument> = defineModel<AdminDocument>("Admin", adminSchema);
```

- [ ] **Step 5: Register it in the portal→model map**

`backend/src/services/account.service.ts` — add the import and the map entry:

```ts
import { Admin, type AdminDocument } from "../models/admin.model.js";

export type AccountDocument = SeekerDocument | RecruiterDocument | AdminDocument;

const MODELS = {
  seeker: Seeker,
  recruiter: Recruiter,
  admin: Admin,
} as const;
```

- [ ] **Step 6: Rebuild shared and typecheck to surface every third-case site**

Run: `npm run build --workspace @jobportal/shared && npm run typecheck`
Expected: errors only where a third portal genuinely needs handling. Fix exactly two, both of which must stay two-portal:

`backend/src/middleware/authenticate.ts:89` — keep the list, document why:

```ts
/**
 * Ambient-identity portals for `authenticateAny` / `optionalAuthenticate`.
 *
 * Deliberately excludes "admin". These two resolve whoever the browser happens
 * to be on domain routes (jobs, applications). An admin is an authority over
 * the domain, not a participant in it, so an admin cookie must never silently
 * satisfy a route that meant "some logged-in user". Admin-only routes name
 * their portal with `authenticate("admin")`.
 */
const CANDIDATES: readonly Portal[] = ["seeker", "recruiter"];
```

`backend/tests/auth/helpers.ts:66` — `authTestApp` mounts only the portals whose auth flows it exercises:

```ts
  // Only the two portals with a full register/verify/login flow. The admin
  // router is a different shape (Task 8) and has its own suite.
  for (const portal of ["seeker", "recruiter"] as const) {
```

- [ ] **Step 7: Run the tests**

Run: `npm test --workspace @jobportal/api -- models`
Expected: PASS, 4 new tests.

- [ ] **Step 8: Write the ADR**

Create `docs/adr/0006-three-account-collections.md`:

```markdown
# ADR-0006: Three account collections

**Status:** Accepted (2026-08-06) — supersedes ADR-0001. Implemented in Phase 3A.

## Context

ADR-0001 split `users` into `seekers` and `recruiters`. Phase 3A adds a third
role, admin, whose job is to approve recruiters — recruiter self-registration
was open to the world, which made the portal boundary decorative.

## Decision

Add an `admins` collection and a third `Portal` value rather than an `isAdmin`
flag on recruiters.

The portal boundary is cryptographic: `accessTokenKey(portal)` derives a
per-portal signing key via HKDF, so a token minted for one portal fails
*signature verification* at another's mount, independent of any claim check. A
role flag would put admins and recruiters on one key and collapse that boundary
to a single boolean comparison — exactly the fragility `accessTokenKey`'s
comment warns against.

Admins never self-register: the admin auth router omits `/register`, and the
first admin is created by `npm run seed:admin --workspace @jobportal/api`.

## Consequences

`accountModel` is a `Record<Portal, Model>`, so the third portal was a compile
error at every site needing a case. `keys.ts` and `cookies.ts` needed no change.
`authenticateAny`/`optionalAuthenticate` deliberately still consider only seeker
and recruiter — an admin is an authority over the job domain, not a participant.
```

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/auth.ts backend/src/models/admin.model.ts \
  backend/src/services/account.service.ts backend/src/middleware/authenticate.ts \
  backend/tests/auth/helpers.ts backend/tests/models.test.ts \
  docs/adr/0006-three-account-collections.md
git commit -m "feat(api): add the admin portal and admins collection"
```

---

### Task 2: `status` gains `pending`, and recruiter registration uses it

**Files:**
- Modify: `backend/src/models/authFields.ts:33`
- Modify: `backend/src/services/auth.service.ts` (inside `register`)
- Test: `backend/tests/auth/register.test.ts`

**Interfaces:**
- Consumes: `Portal` from Task 1.
- Produces: accounts with `status: "pending" | "active" | "suspended"`; recruiter registration yields `"pending"`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/auth/register.test.ts`:

```ts
import { Recruiter } from "../../src/models/recruiter.model.js";
import { Seeker } from "../../src/models/seeker.model.js";

describe("recruiter registration is gated", () => {
  it("creates a recruiter as pending", async () => {
    await request(app)
      .post("/api/v1/recruiter/auth/register")
      .send({ fullName: "New Rec", email: "rec@example.com", password: "correct horse battery staple" })
      .expect(201);

    const rec = await Recruiter.findOne({ email: "rec@example.com" });
    expect(rec?.status).toBe("pending");
  });

  it("still creates a seeker as active", async () => {
    await request(app)
      .post("/api/v1/seeker/auth/register")
      .send({ fullName: "New Seek", email: "seek@example.com", password: "correct horse battery staple" })
      .expect(201);

    const seek = await Seeker.findOne({ email: "seek@example.com" });
    expect(seek?.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- register`
Expected: FAIL — recruiter status is `"active"`.

- [ ] **Step 3: Widen the enum**

`backend/src/models/authFields.ts:33`:

```ts
  status: { type: String, enum: ["pending", "active", "suspended"], default: "active" },
```

- [ ] **Step 4: Set pending on recruiter registration**

In `register()` in `backend/src/services/auth.service.ts`, in the `accountModel(portal).create({ ... })` call, add:

```ts
      emailVerifiedAt: null,
      // Recruiters land pending and are useless until an admin approves them:
      // registration alone must not confer the ability to post jobs or read
      // applicants. Seekers and admins are unaffected — admins never reach
      // this path at all, because the admin router omits /register.
      status: portal === "recruiter" ? "pending" : "active",
```

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace @jobportal/api -- register`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/authFields.ts backend/src/services/auth.service.ts \
  backend/tests/auth/register.test.ts
git commit -m "feat(api): recruiters register as pending"
```

---

### Task 3: Admit `pending` at all five status gates

**Files:**
- Modify: `backend/src/middleware/authenticate.ts:34`, `:103`
- Modify: `backend/src/services/auth.service.ts:~350`
- Modify: `backend/src/services/googleAuth.service.ts:123`, `:158`
- Test: `backend/tests/auth/pending.test.ts` (create)

**Interfaces:**
- Consumes: pending recruiters from Task 2.
- Produces: a pending recruiter can log in and hold a session; suspended still cannot, at every gate.

Five sites currently read `status !== "active"`. Each becomes `status === "suspended"`. Change them **one at a time**, not by find-and-replace: an error in the permissive direction admits suspended accounts on every portal at once.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth/pending.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { Recruiter } from "../../src/models/recruiter.model.js";
import { installCaptureMailer, lastCodeFor, cookieValue } from "./helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function registerAndVerify(email: string): Promise<void> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Pending Rec", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post("/api/v1/recruiter/auth/verify-email").send({ email, code });
}

describe("pending recruiters", () => {
  beforeEach(() => installCaptureMailer());

  it("can log in while pending", async () => {
    await registerAndVerify("pending@example.com");
    const res = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "pending@example.com", password: PASSWORD })
      .expect(200);
    expect(cookieValue(res, "jp_recruiter_at")).toBeTruthy();
  });

  it("passes authenticate and reaches /me while pending", async () => {
    await registerAndVerify("pending2@example.com");
    const login = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "pending2@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_recruiter_at")!;

    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(200);
  });

  it("a suspended account still cannot log in", async () => {
    await registerAndVerify("susp@example.com");
    await Recruiter.updateOne({ email: "susp@example.com" }, { $set: { status: "suspended" } });
    await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "susp@example.com", password: PASSWORD })
      .expect(401);
  });

  it("a suspended account's existing token is refused by authenticate", async () => {
    await registerAndVerify("susp2@example.com");
    const login = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "susp2@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_recruiter_at")!;

    await Recruiter.updateOne({ email: "susp2@example.com" }, { $set: { status: "suspended" } });

    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- pending`
Expected: FAIL — the login and `/me` cases 401, because pending is not `"active"`.

- [ ] **Step 3: Relax gate 1 of 5 — `authenticate`**

`backend/src/middleware/authenticate.ts:34`:

```ts
    if (!account || account.status === "suspended") {
```

Update the comment directly beneath it to read:

```ts
      // Deleted or suspended between minting and use. Pending is deliberately
      // NOT refused here: identity and authorization are separate layers, and
      // a pending recruiter must be able to reach /me to learn why they are
      // blocked. requireApproved (Task 7) is what refuses them.
```

- [ ] **Step 4: Relax gates 2–5**

`backend/src/middleware/authenticate.ts:103` (inside `resolveSession`):

```ts
  if (!account || account.status === "suspended") return false;
```

`backend/src/services/auth.service.ts:~350` (login):

```ts
  if (account.status === "suspended") {
```

`backend/src/services/googleAuth.service.ts:123`:

```ts
    if (bySub.status === "suspended") return { kind: "failed" };
```

`backend/src/services/googleAuth.service.ts:158`:

```ts
  if (byEmail.status === "suspended") return { kind: "failed" };
```

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace @jobportal/api -- pending`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the whole API suite for regressions**

Run: `npm test --workspace @jobportal/api`
Expected: PASS. These five sites are on the path of every authenticated request; nothing else may move.

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/authenticate.ts backend/src/services/auth.service.ts \
  backend/src/services/googleAuth.service.ts backend/tests/auth/pending.test.ts
git commit -m "feat(api): admit pending accounts at the identity layer"
```

---

### Task 4: `/me` reports account status

**Files:**
- Modify: `packages/shared/src/auth-dto.ts:4-11`
- Modify: `backend/src/controllers/auth.controller.ts` (the DTO builder used by `meHandler`/`loginHandler`)
- Test: `backend/tests/auth/pending.test.ts`

**Interfaces:**
- Consumes: pending sessions from Task 3.
- Produces: `SessionUser.status: "pending" | "active" | "suspended"`, consumed by the frontend in Task 11.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/auth/pending.test.ts`:

```ts
  it("/me reports the pending status so the client can explain it", async () => {
    await registerAndVerify("pending3@example.com");
    const login = await request(app)
      .post("/api/v1/recruiter/auth/login")
      .send({ email: "pending3@example.com", password: PASSWORD });
    const access = cookieValue(login, "jp_recruiter_at")!;

    const me = await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(200);

    expect(me.body.user.status).toBe("pending");
    expect(login.body.user.status).toBe("pending");
  });

  it("a seeker reports active", async () => {
    await request(app)
      .post("/api/v1/seeker/auth/register")
      .send({ fullName: "S", email: "s-status@example.com", password: PASSWORD });
    const code = await lastCodeFor("s-status@example.com");
    await request(app).post("/api/v1/seeker/auth/verify-email").send({ email: "s-status@example.com", code });
    const login = await request(app)
      .post("/api/v1/seeker/auth/login")
      .send({ email: "s-status@example.com", password: PASSWORD })
      .expect(200);
    expect(login.body.user.status).toBe("active");
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- pending`
Expected: FAIL — `status` is `undefined`.

- [ ] **Step 3: Widen the DTO**

`packages/shared/src/auth-dto.ts`:

```ts
import type { Portal } from "./auth.js";

/** The account status that crosses the wire. `suspended` never does in
 *  practice — a suspended session is refused before any DTO is built — but the
 *  union matches the schema so the client needs no impossible-case handling. */
export type AccountStatus = "pending" | "active" | "suspended";

/** The only account shape that ever crosses the wire. */
export interface SessionUser {
  id: string;
  portal: Portal;
  fullName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: AccountStatus;
}
```

- [ ] **Step 4: Populate it**

In `backend/src/controllers/auth.controller.ts`, find the single place that builds the `SessionUser` DTO (the object literal with `id`, `portal`, `fullName`, `email`, `emailVerified`, `avatarUrl`) and add:

```ts
    status: account.status as AccountStatus,
```

Import `AccountStatus` from `@jobportal/shared`. If more than one site builds this literal, extract a `toSessionUser(account, portal)` helper in that file and use it at every site — the DTO must not be able to drift.

- [ ] **Step 5: Rebuild shared, run the tests**

Run: `npm run build --workspace @jobportal/shared && npm test --workspace @jobportal/api -- pending`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/auth-dto.ts backend/src/controllers/auth.controller.ts \
  backend/tests/auth/pending.test.ts
git commit -m "feat(api): expose account status on the session DTO"
```

---

### Task 5: Google may sign in a recruiter but never create one

**Files:**
- Modify: `backend/src/services/googleAuth.service.ts:134-156` (branch 3)
- Test: `backend/tests/auth/google.test.ts`

**Interfaces:**
- Consumes: `resolveIdentity(portal, identity)` from Task 3.
- Produces: unknown Google identity on the recruiter portal → `{ kind: "failed" }`, zero rows created.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/auth/google.test.ts`, following that file's existing pattern for stubbing `googleOAuth().exchange` and driving the callback:

```ts
describe("google cannot create a recruiter", () => {
  it("refuses an unknown identity on the recruiter portal and creates no row", async () => {
    const before = await Recruiter.countDocuments();

    const res = await driveGoogleCallback("recruiter", {
      sub: "google-stranger-1",
      email: "stranger@example.com",
      emailVerified: true,
      fullName: "Stranger",
      avatarUrl: null,
    });

    // Uniform failure landing — never a distinct code that maps the defences.
    expect(res.headers.location).toContain("/auth/error");
    expect(await Recruiter.countDocuments()).toBe(before);
  });

  it("still creates a seeker for an unknown identity", async () => {
    const before = await Seeker.countDocuments();
    await driveGoogleCallback("seeker", {
      sub: "google-stranger-2",
      email: "stranger2@example.com",
      emailVerified: true,
      fullName: "Stranger Two",
      avatarUrl: null,
    });
    expect(await Seeker.countDocuments()).toBe(before + 1);
  });

  it("still signs in a recruiter whose googleId is already known", async () => {
    await Recruiter.create({
      email: "known@example.com",
      fullName: "Known Rec",
      googleId: "google-known-1",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "active",
    });

    const res = await driveGoogleCallback("recruiter", {
      sub: "google-known-1",
      email: "known@example.com",
      emailVerified: true,
      fullName: "Known Rec",
      avatarUrl: null,
    });
    expect(res.headers.location).not.toContain("/auth/error");
  });
});
```

If `driveGoogleCallback` does not already exist in that file, extract it from the existing callback tests as a local helper with the signature `(portal: Portal, identity: GoogleIdentity) => Promise<SupertestResponse>`, so all three cases share one driver.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- google`
Expected: FAIL — the recruiter count increases by one.

- [ ] **Step 3: Make the stranger branch portal-aware**

In `resolveIdentity` in `backend/src/services/googleAuth.service.ts`, immediately before the `if (!byEmail) {` block:

```ts
  // Branch 3 is account CREATION, and only the seeker portal may reach it.
  // Recruiter access is granted by an admin, never by arriving with a Google
  // identity — otherwise "Continue with Google" on /hire/signup is a
  // self-service recruiter factory. Existing recruiters are unaffected:
  // branches 1, 2a, 2b and 2c above already handled every known account, so
  // sign-in and linking still work. Admins never reach here at all — the admin
  // router mounts no Google routes (Task 8).
  if (!byEmail && portal !== "seeker") return { kind: "failed" };
```

- [ ] **Step 4: Run the tests**

Run: `npm test --workspace @jobportal/api -- google`
Expected: PASS, and every pre-existing Google test still passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/googleAuth.service.ts backend/tests/auth/google.test.ts
git commit -m "fix(api): google can sign in a recruiter but never create one"
```

---

### Task 6: The admin auth router omits `/register` and `/google*`

**Files:**
- Modify: `backend/src/routes/auth.route.ts:43-74`
- Modify: `backend/src/app.ts:31-32`
- Test: `backend/tests/auth/admin-portal.test.ts` (create)

**Interfaces:**
- Consumes: `buildAuthRouter(portal)`.
- Produces: `/api/v1/admin/auth/*` with login, refresh, logout, me, forgot-password and reset-password only.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth/admin-portal.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

const app = buildApp();

describe("admin auth router", () => {
  it("has no registration route", async () => {
    await request(app)
      .post("/api/v1/admin/auth/register")
      .send({ fullName: "X", email: "x@example.com", password: "correct horse battery staple" })
      .expect(404);
  });

  it("has no google routes", async () => {
    await request(app).get("/api/v1/admin/auth/google").expect(404);
    await request(app).get("/api/v1/admin/auth/google/callback").expect(404);
    await request(app).post("/api/v1/admin/auth/google/confirm-link").send({ token: "x" }).expect(404);
  });

  it("does expose login", async () => {
    // 401 not 404: the route exists and rejects the credentials.
    await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ email: "nobody@example.com", password: "correct horse battery staple" })
      .expect(401);
  });

  it("does expose /me, unauthenticated", async () => {
    await request(app).get("/api/v1/admin/auth/me").expect(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- admin-portal`
Expected: FAIL — `/api/v1/admin/auth/*` is not mounted at all, so login 404s too.

- [ ] **Step 3: Gate the two route groups**

In `buildAuthRouter` in `backend/src/routes/auth.route.ts`, replace the unconditional `router.post("/register", ...)` line with:

```ts
  // Admins are never self-served. There is no registration surface to attack,
  // rate-limit or reason about; the first admin comes from seed:admin and the
  // rest are created by an existing admin.
  if (portal !== "admin") {
    router.post("/register", rlRegister, registerHandler(portal));
  }
```

and wrap the three Google routes:

```ts
  // No Google on the admin portal: the highest-privilege portal gains nothing
  // from a third-party identity path. The routes do not exist rather than
  // existing and refusing.
  if (portal !== "admin") {
    router.get("/google", rlGoogle, googleStartHandler(portal));
    // No CSRF on the callback: a top-level GET navigation Google initiates, to
    // which no header can be attached. Its protections are the signed lax
    // transaction cookie, state, and nonce (Task 9).
    router.get("/google/callback", googleCallbackHandler(portal));
    router.post("/google/confirm-link", rlRedeem, confirmGoogleLinkHandler(portal));
  }
```

- [ ] **Step 4: Mount the admin auth router**

`backend/src/app.ts`, after the recruiter mount:

```ts
  app.use("/api/v1/admin/auth", buildAuthRouter("admin"));
```

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace @jobportal/api -- admin-portal`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.route.ts backend/src/app.ts backend/tests/auth/admin-portal.test.ts
git commit -m "feat(api): mount the admin auth router without register or google"
```

---

### Task 7: `requireApproved` blocks pending recruiters from recruiter-owned work

**Files:**
- Create: `backend/src/middleware/requireApproved.ts`
- Modify: `backend/src/routes/company.route.ts`, `backend/src/routes/job.route.ts`, `backend/src/routes/application.route.ts`
- Test: `backend/tests/approval.test.ts` (create)

**Interfaces:**
- Consumes: `req.auth` from `authenticate("recruiter")`.
- Produces: `requireApproved` — an Express middleware answering 403 `RECRUITER_PENDING_APPROVAL`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/approval.test.ts`:

```ts
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Recruiter } from "../src/models/recruiter.model.js";
import { installCaptureMailer, lastCodeFor, cookieValue } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function pendingRecruiter(email: string): Promise<string> {
  await request(app)
    .post("/api/v1/recruiter/auth/register")
    .send({ fullName: "Pending", email, password: PASSWORD });
  const code = await lastCodeFor(email);
  await request(app).post("/api/v1/recruiter/auth/verify-email").send({ email, code });
  const login = await request(app)
    .post("/api/v1/recruiter/auth/login")
    .send({ email, password: PASSWORD });
  return cookieValue(login, "jp_recruiter_at")!;
}

describe("requireApproved", () => {
  beforeEach(() => installCaptureMailer());

  it("refuses company creation with 403 RECRUITER_PENDING_APPROVAL", async () => {
    const access = await pendingRecruiter("p1@example.com");
    const res = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ name: "Acme" })
      .expect(403);
    expect(res.body.code).toBe("RECRUITER_PENDING_APPROVAL");
  });

  it("refuses job creation", async () => {
    const access = await pendingRecruiter("p2@example.com");
    await request(app)
      .post("/api/v1/job/post")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ title: "Dev" })
      .expect(403);
  });

  it("allows the same call once approved", async () => {
    const access = await pendingRecruiter("p3@example.com");
    await Recruiter.updateOne({ email: "p3@example.com" }, { $set: { status: "active" } });
    const res = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ name: "Acme Two" });
    expect(res.status).not.toBe(403);
  });

  it("is unreachable for an anonymous caller — 401 before 403", async () => {
    await request(app).post("/api/v1/company/register").send({ name: "Acme" }).expect(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- approval`
Expected: FAIL — the pending recruiter's calls succeed.

- [ ] **Step 3: Write the middleware**

Create `backend/src/middleware/requireApproved.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { findAccountById } from "../services/account.service.js";

/**
 * Refuses a recruiter whose account an admin has not yet approved.
 *
 * Mounted AFTER `authenticate("recruiter")`, which is what establishes identity.
 * The split is deliberate: `authenticate` admits a pending recruiter so they can
 * reach /me and be told why they are blocked; this decides what they may do.
 *
 * 403 rather than the 404 used for ownership failures. That rule exists so a
 * foreign recruiter cannot prove a resource EXISTS; this refusal is about the
 * caller's own account state and discloses nothing about any resource. A 404
 * here would also be a lie — the resource frequently does not exist yet, because
 * the call being refused is the one that would create it.
 */
export async function requireApproved(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    next(AppError.unauthorized("SESSION_MISSING", "Sign in to continue."));
    return;
  }

  const account = await findAccountById(req.auth.portal, req.auth.id);
  if (!account) {
    next(AppError.unauthorized("SESSION_INVALID", "Sign in to continue."));
    return;
  }

  if (account.status === "pending") {
    next(
      AppError.forbidden(
        "RECRUITER_PENDING_APPROVAL",
        "Your recruiter account is awaiting approval.",
      ),
    );
    return;
  }

  next();
}
```

- [ ] **Step 4: Mount it on every recruiter-owned mutation**

These routes use the chained `router.route(path).verb(...)` style, so the
middleware slots in as an extra argument before the controller. Import it with
the `.js` extension in each file:

```ts
import { requireApproved } from "../middleware/requireApproved.js";
```

`backend/src/routes/company.route.ts`:

```ts
router.route("/register").post(authenticate("recruiter"), requireApproved, registerCompany);
router.route("/update/:id").put(authenticate("recruiter"), requireApproved, logoUpload, updateCompany);
```

`backend/src/routes/job.route.ts`:

```ts
router.route("/post").post(authenticate("recruiter"), requireApproved, postJob);
```

`backend/src/routes/application.route.ts`:

```ts
router.route("/:id/applicants").get(authenticate("recruiter"), requireApproved, getApplicants);
router.route("/status/:id/update").post(authenticate("recruiter"), requireApproved, updateStatus);
```

Deliberately **not** gated: `company /get`, `company /get/:id` and
`job /getadminjobs`. These read only the caller's own rows, which for a pending
recruiter is the empty set — gating them would turn an ordinary empty workspace
into an error screen. The public seeker-facing reads (`job /get`,
`job /get/:id`) are untouched. There are no job update or delete routes in the
codebase, so nothing else needs gating.

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace @jobportal/api -- approval`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm test --workspace @jobportal/api`
Expected: PASS. Pre-existing recruiter tests use `signedUpOn("recruiter", ...)`, which now yields a **pending** recruiter — any that exercise a gated route will fail. Fix them by approving the recruiter in the test's setup:

```ts
await Recruiter.updateOne({ _id: recruiter.id }, { $set: { status: "active" } });
```

Do not weaken `requireApproved` to make them pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/requireApproved.ts backend/src/routes/ backend/tests/
git commit -m "feat(api): gate recruiter-owned routes behind admin approval"
```

---

### Task 8: The approval service and its admin route

**Files:**
- Create: `backend/src/services/approval.service.ts`
- Create: `backend/src/routes/admin.route.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/lib/emailTemplates.ts`
- Test: `backend/tests/approval.test.ts`

**Interfaces:**
- Consumes: `authenticate("admin")`.
- Produces: `listPendingRecruiters(): Promise<PendingRecruiterDto[]>`, `approveRecruiter(id: string): Promise<void>`; routes `GET /api/v1/admin/recruiters/pending` and `POST /api/v1/admin/recruiters/:id/approve`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/approval.test.ts`:

```ts
import { Admin } from "../src/models/admin.model.js";
import { outbox } from "./auth/helpers.js";

async function signedInAdmin(email: string): Promise<string> {
  await Admin.create({
    email,
    fullName: "Root Admin",
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });
  // Set a password through the normal reset flow — seed:admin does the same.
  await request(app).post("/api/v1/admin/auth/forgot-password").send({ email });
  const code = await lastCodeFor(email);
  await request(app)
    .post("/api/v1/admin/auth/reset-password")
    .send({ email, code, newPassword: PASSWORD });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  return cookieValue(login, "jp_admin_at")!;
}

describe("admin approval", () => {
  beforeEach(() => installCaptureMailer());

  it("lists pending recruiters", async () => {
    await pendingRecruiter("list1@example.com");
    const admin = await signedInAdmin("root1@example.com");

    const res = await request(app)
      .get("/api/v1/admin/recruiters/pending")
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect(res.body.items.map((r: { email: string }) => r.email)).toContain("list1@example.com");
    // Projected DTO only — never the raw document.
    expect(res.body.items[0].passwordHash).toBeUndefined();
  });

  it("approves a recruiter and mails them", async () => {
    const access = await pendingRecruiter("appr@example.com");
    const rec = await Recruiter.findOne({ email: "appr@example.com" });
    const admin = await signedInAdmin("root2@example.com");

    await request(app)
      .post(`/api/v1/admin/recruiters/${String(rec!._id)}/approve`)
      .set("Cookie", [`jp_admin_at=${admin}`])
      .expect(200);

    expect((await Recruiter.findById(rec!._id))?.status).toBe("active");
    expect(outbox.some((m) => m.to === "appr@example.com")).toBe(true);

    // The recruiter's existing session now works on a gated route.
    const res = await request(app)
      .post("/api/v1/company/register")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .send({ name: "Approved Co" });
    expect(res.status).not.toBe(403);
  });

  it("refuses a recruiter token on the admin route", async () => {
    const access = await pendingRecruiter("notadmin@example.com");
    await request(app)
      .get("/api/v1/admin/recruiters/pending")
      .set("Cookie", [`jp_recruiter_at=${access}`])
      .expect(401);
  });

  it("refuses an admin token presented as a recruiter cookie — signature check", async () => {
    const admin = await signedInAdmin("root3@example.com");
    await request(app)
      .get("/api/v1/recruiter/auth/me")
      .set("Cookie", [`jp_recruiter_at=${admin}`])
      .expect(401);
  });

  it("is idempotent — approving an active recruiter is a no-op 200", async () => {
    await pendingRecruiter("idem@example.com");
    const rec = await Recruiter.findOne({ email: "idem@example.com" });
    const admin = await signedInAdmin("root4@example.com");
    const url = `/api/v1/admin/recruiters/${String(rec!._id)}/approve`;
    await request(app).post(url).set("Cookie", [`jp_admin_at=${admin}`]).expect(200);
    await request(app).post(url).set("Cookie", [`jp_admin_at=${admin}`]).expect(200);
    expect((await Recruiter.findById(rec!._id))?.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- approval`
Expected: FAIL — `/api/v1/admin/recruiters/pending` 404s.

- [ ] **Step 3: Write the service**

Create `backend/src/services/approval.service.ts`:

```ts
import { Recruiter } from "../models/recruiter.model.js";
import { AppError } from "../lib/AppError.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderRecruiterApprovedEmail } from "../lib/emailTemplates.js";

export interface PendingRecruiterDto {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

/**
 * Explicit projection, never the raw document — the same rule as every other
 * DTO here. `passwordHash` is `select: false`, but relying on that alone is how
 * a hash eventually ships.
 */
export async function listPendingRecruiters(): Promise<PendingRecruiterDto[]> {
  const rows = await Recruiter.find({ status: "pending" })
    .select("fullName email createdAt")
    .sort({ createdAt: 1 })
    .limit(50);

  return rows.map((r) => ({
    id: String(r._id),
    fullName: r.fullName,
    email: r.email,
    createdAt: (r as unknown as { createdAt: Date }).createdAt.toISOString(),
  }));
}

/**
 * Flips pending → active. Guarded on the current status so two admins racing
 * the same approval send exactly one mail; the second sees `matchedCount: 0`
 * and returns quietly, which is why the route is idempotent.
 */
export async function approveRecruiter(id: string): Promise<void> {
  const exists = await Recruiter.exists({ _id: id });
  if (!exists) throw AppError.notFound("NOT_FOUND", "No such recruiter.");

  const result = await Recruiter.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "active" } },
  );
  if (result.matchedCount === 0) return; // already approved

  const account = await Recruiter.findById(id).select("email");
  if (account) dispatch(sendRendered(account.email, renderRecruiterApprovedEmail()));
}
```

- [ ] **Step 4: Add the mail template**

Append to `backend/src/lib/emailTemplates.ts`, following `renderAccountClaimedEmail`'s shape — the return type is `Rendered` and the HTML goes through the file's `WRAPPER` helper:

```ts
/** Sent when an admin approves a pending recruiter (Phase 3A). */
export function renderRecruiterApprovedEmail(): Rendered {
  return {
    subject: "Your recruiter account is approved",
    html: WRAPPER(`<h1 style="font-size:1.25rem">You're approved</h1><p>An admin has approved your recruiter account. You can now create a company profile and post roles.</p>`),
    text: `You're approved\n\nAn admin has approved your recruiter account. You can now create a company profile and post roles.`,
  };
}
```

- [ ] **Step 5: Write the route**

Create `backend/src/routes/admin.route.ts`:

```ts
import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { listPendingRecruiters, approveRecruiter } from "../services/approval.service.js";

/**
 * Admin-only domain routes. `authenticate("admin")` is a literal, so a
 * recruiter or seeker token fails signature verification here rather than a
 * claim comparison.
 */
export const adminRoute = Router();

adminRoute.get("/recruiters/pending", authenticate("admin"), async (_req, res) => {
  res.json({ success: true, items: await listPendingRecruiters() });
});

adminRoute.post("/recruiters/:id/approve", authenticate("admin"), async (req, res) => {
  await approveRecruiter(String(req.params.id));
  res.json({ success: true });
});
```

- [ ] **Step 6: Mount it**

`backend/src/app.ts`, after the admin auth mount:

```ts
  app.use("/api/v1/admin", adminRoute);
```

- [ ] **Step 7: Run the tests**

Run: `npm test --workspace @jobportal/api -- approval`
Expected: PASS, 9 tests total in the file.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/approval.service.ts backend/src/routes/admin.route.ts \
  backend/src/app.ts backend/src/lib/emailTemplates.ts backend/tests/approval.test.ts
git commit -m "feat(api): admin can list and approve pending recruiters"
```

---

### Task 9: `seed:admin` bootstrap script

**Files:**
- Create: `backend/src/scripts/seed-admin.ts`
- Modify: `backend/package.json` (scripts)
- Test: `backend/tests/seed-admin.test.ts` (create)

**Interfaces:**
- Consumes: `Admin` model, the OTP issuance path.
- Produces: `seedAdmin({ email, fullName, force }): Promise<{ created: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/seed-admin.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { Admin } from "../src/models/admin.model.js";
import { seedAdmin } from "../src/scripts/seed-admin.js";
import { installCaptureMailer, outbox } from "./auth/helpers.js";

describe("seedAdmin", () => {
  beforeEach(() => installCaptureMailer());

  it("creates the first admin with no password and mails a set-password code", async () => {
    const result = await seedAdmin({ email: "root@example.com", fullName: "Root Admin" });
    expect(result.created).toBe(true);

    const admin = await Admin.findOne({ email: "root@example.com" }).select("+passwordHash");
    expect(admin).not.toBeNull();
    expect(admin?.passwordHash ?? null).toBeNull();
    expect(admin?.emailVerifiedAt).not.toBeNull();
    expect(outbox.some((m) => m.to === "root@example.com" && /\d{6}/.test(m.text))).toBe(true);
  });

  it("refuses a second admin unless forced", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    await expect(seedAdmin({ email: "other@example.com", fullName: "Other" })).rejects.toThrow(
      /already exists/i,
    );
    expect(await Admin.countDocuments()).toBe(1);
  });

  it("creates a second admin when forced", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    const result = await seedAdmin({ email: "other@example.com", fullName: "Other", force: true });
    expect(result.created).toBe(true);
    expect(await Admin.countDocuments()).toBe(2);
  });

  it("is idempotent for the same email", async () => {
    await seedAdmin({ email: "root@example.com", fullName: "Root" });
    const again = await seedAdmin({ email: "root@example.com", fullName: "Root", force: true });
    expect(again.created).toBe(false);
    expect(await Admin.countDocuments()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- seed-admin`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

Create `backend/src/scripts/seed-admin.ts`:

```ts
import { Admin } from "../models/admin.model.js";
import { issuePasswordSetupCode } from "../services/auth.service.js";
import { logger } from "../lib/logger.js";

export interface SeedAdminInput {
  email: string;
  fullName: string;
  force?: boolean;
}

/**
 * Creates the first admin.
 *
 * No password is accepted as an argument — a CLI argument lands in shell
 * history, process listings and CI logs. The account is created with
 * `passwordHash: null` and a set-password code is mailed, which is the same
 * path forgot-password already uses.
 *
 * Refuses when any admin already exists unless forced, so a stray re-run during
 * deployment cannot quietly mint a second authority.
 */
export async function seedAdmin(input: SeedAdminInput): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase();

  const existing = await Admin.findOne({ email });
  if (existing) {
    logger.info({ email }, "admin already exists; nothing to do");
    return { created: false };
  }

  const count = await Admin.countDocuments();
  if (count > 0 && !input.force) {
    throw new Error(
      `An admin already exists (${count}). Re-run with --force to create another.`,
    );
  }

  const admin = await Admin.create({
    email,
    fullName: input.fullName,
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });

  await issuePasswordSetupCode("admin", admin);
  logger.info({ email }, "admin created; set-password code mailed");
  return { created: true };
}
```

If `auth.service.ts` has no exported helper that issues a `reset_password` OTP for an account, export its existing private `issueOtp` under the name `issuePasswordSetupCode` with the signature `(portal: Portal, account: AccountDoc) => Promise<void>` and a comment noting the seed script is its second caller. Do not duplicate the OTP logic.

- [ ] **Step 4: Add the CLI entry point**

Append to `backend/src/scripts/seed-admin.ts`, mirroring `migrate-phase1c.ts`'s
entry block exactly — note it connects with `mongoose` directly and guards on a
regex against `process.argv[1]`:

```ts
// Run directly (`npm run seed:admin`), not when imported by a test.
const invokedDirectly = /seed-admin\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  const arg = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const email = arg("--email");
  const fullName = arg("--name");
  if (!email || !fullName) {
    console.error('Usage: --email <address> --name "<full name>" [--force]');
    process.exit(1);
  }
  await mongoose.connect(env().MONGO_URI);
  const r = await seedAdmin({ email, fullName, force: process.argv.includes("--force") });
  console.log(
    r.created
      ? "Admin created; check the mailbox for a set-password code."
      : "Admin already existed.",
  );
  await mongoose.disconnect();
}
```

This needs `import mongoose from "mongoose";` and `import { env } from "../config/env.js";` at the top of the file.

- [ ] **Step 5: Add the npm script**

`backend/package.json`:

```json
    "seed:admin": "tsx src/scripts/seed-admin.ts",
```

- [ ] **Step 6: Run the tests**

Run: `npm test --workspace @jobportal/api -- seed-admin`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/scripts/seed-admin.ts backend/package.json backend/tests/seed-admin.test.ts \
  backend/src/services/auth.service.ts
git commit -m "feat(api): seed:admin bootstraps the first admin"
```

---

### Task 10: Phase 3A migration

**Files:**
- Create: `backend/src/scripts/migrate-phase3a.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/migration-phase3a.test.ts` (create)

**Interfaces:**
- Produces: `migratePhase3a(): Promise<{ grandfathered: number; droppedUsers: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/migration-phase3a.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { Recruiter } from "../src/models/recruiter.model.js";
import { migratePhase3a } from "../src/scripts/migrate-phase3a.js";

describe("migratePhase3a", () => {
  it("grandfathers verified recruiters to active", async () => {
    await Recruiter.create({
      email: "old@example.com",
      fullName: "Old Rec",
      passwordHash: null,
      emailVerifiedAt: new Date(),
      status: "pending",
    });

    const result = await migratePhase3a();

    expect(result.grandfathered).toBe(1);
    expect((await Recruiter.findOne({ email: "old@example.com" }))?.status).toBe("active");
  });

  it("leaves an unverified recruiter pending", async () => {
    await Recruiter.create({
      email: "unver@example.com",
      fullName: "Unverified",
      passwordHash: null,
      emailVerifiedAt: null,
      status: "pending",
    });

    await migratePhase3a();

    expect((await Recruiter.findOne({ email: "unver@example.com" }))?.status).toBe("pending");
  });

  it("drops the legacy users collection and is safe to re-run", async () => {
    await mongoose.connection.db!.createCollection("users");
    const first = await migratePhase3a();
    expect(first.droppedUsers).toBe(true);

    const second = await migratePhase3a();
    expect(second.droppedUsers).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/api -- migration-phase3a`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

Create `backend/src/scripts/migrate-phase3a.ts`:

```ts
import mongoose from "mongoose";
import { Recruiter } from "../models/recruiter.model.js";
import { logger } from "../lib/logger.js";

/**
 * One-shot, idempotent, run once per database.
 *
 * Task 2 made recruiters register as pending. Recruiters that existed BEFORE
 * that change were legitimate, so gating them retroactively would lock real
 * accounts out of their own companies. Only verified ones are grandfathered:
 * an unverified pre-existing row is indistinguishable from an abandoned
 * signup and stays pending.
 *
 * Also drops the legacy `users` collection, which Phase 1C's migration never
 * ran against on every database.
 */
export async function migratePhase3a(): Promise<{ grandfathered: number; droppedUsers: boolean }> {
  const result = await Recruiter.updateMany(
    { status: "pending", emailVerifiedAt: mongoose.trusted({ $ne: null }) },
    { $set: { status: "active" } },
  );

  const db = mongoose.connection.db;
  if (!db) throw new Error("no database connection");
  const existing = await db.listCollections({ name: "users" }).toArray();
  let droppedUsers = false;
  if (existing.length > 0) {
    await db.dropCollection("users");
    droppedUsers = true;
  }

  logger.info({ grandfathered: result.modifiedCount, droppedUsers }, "phase 3a migration complete");
  return { grandfathered: result.modifiedCount, droppedUsers };
}
```

`mongoose.trusted` is required: `sanitizeFilter` is global, so a bare `{ $ne: null }` would be compared as a literal.

- [ ] **Step 4: Add the CLI entry and npm script**

Mirror the entry-point block from `migrate-phase1c.ts` verbatim, changing only
the regex and the function called:

```ts
// Run directly (`npm run migrate:phase3a`), not when imported by a test.
const invokedDirectly = /migrate-phase3a\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await mongoose.connect(env().MONGO_URI);
  const r = await migratePhase3a();
  console.log(`grandfathered ${r.grandfathered} recruiter(s); users collection ${r.droppedUsers ? "dropped" : "absent"}`);
  await mongoose.disconnect();
}
```

This needs `import { env } from "../config/env.js";` alongside the existing
mongoose import. Add to `backend/package.json`:

```json
    "migrate:phase3a": "tsx src/scripts/migrate-phase3a.ts",
```

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace @jobportal/api -- migration-phase3a`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/scripts/migrate-phase3a.ts backend/package.json \
  backend/tests/migration-phase3a.test.ts
git commit -m "feat(api): phase 3a migration grandfathers existing recruiters"
```

---

### Task 11: Frontend — three-way portal resolution and the admin signal token

**Files:**
- Modify: `frontend/src/lib/portalRoutes.ts`
- Modify: `frontend/src/lib/portal.ts:19-22`
- Modify: `frontend/src/index.css`
- Test: `frontend/tests/portalScope.test.tsx`

**Interfaces:**
- Consumes: `Portal` from Task 1.
- Produces: `portalForPath` returning three values; `data-portal="admin"` resolving admin signal tokens.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/portalScope.test.tsx`:

```tsx
import { portalForPath } from "@/lib/portalRoutes";

describe("three-way portal resolution", () => {
  it("maps admin paths to the admin portal", () => {
    expect(portalForPath("/admin")).toBe("admin");
    expect(portalForPath("/admin/login")).toBe("admin");
    expect(portalForPath("/admin/console/recruiters")).toBe("admin");
  });

  it("maps hire paths to the recruiter portal, workspace included", () => {
    expect(portalForPath("/hire")).toBe("recruiter");
    expect(portalForPath("/hire/login")).toBe("recruiter");
    expect(portalForPath("/hire/companies")).toBe("recruiter");
    expect(portalForPath("/hire/jobs/123/applicants")).toBe("recruiter");
  });

  it("still respects segment boundaries", () => {
    expect(portalForPath("/hired")).toBe("seeker");
    expect(portalForPath("/administrator")).toBe("seeker");
    expect(portalForPath("/")).toBe("seeker");
    expect(portalForPath("/jobs")).toBe("seeker");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/web -- portalScope`
Expected: FAIL — `/admin` returns `"recruiter"`.

- [ ] **Step 3: Make the mapping three-way**

Replace the body of `frontend/src/lib/portalRoutes.ts`:

```ts
import type { Portal } from "@jobportal/shared";

/**
 * Route prefix → portal. Ordered most-specific-first is unnecessary here
 * because the prefixes are disjoint, but the segment-boundary match still
 * matters: a bare `startsWith("/hire")` would claim "/hired", and
 * `startsWith("/admin")` would claim "/administrator".
 */
const PREFIXES: ReadonlyArray<readonly [string, Portal]> = [
  ["/admin", "admin"],
  ["/hire", "recruiter"],
];

export function portalForPath(pathname: string): Portal {
  for (const [prefix, portal] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return portal;
  }
  return "seeker";
}
```

- [ ] **Step 4: Widen the portal hint**

`frontend/src/lib/portal.ts:19-22`:

```ts
export function getPortalHint(): Portal | null {
  const raw = localStorage.getItem(KEY);
  return raw === "seeker" || raw === "recruiter" || raw === "admin" ? raw : null;
}
```

- [ ] **Step 5: Add the admin signal tokens**

In `frontend/src/index.css`, beside the existing `[data-portal="recruiter"]` blocks, add an admin block in **both** the light and dark theme sections, following exactly the shape of the recruiter block:

```css
[data-portal="admin"] {
  --signal: oklch(0.55 0.19 330);
  --signal-text: oklch(0.44 0.19 330);
  --signal-fg: oklch(0.99 0 0);
  --signal-muted: oklch(0.95 0.03 330);
  --signal-ring: oklch(0.55 0.19 330 / 0.45);
}
```

and in the dark section:

```css
[data-portal="admin"] {
  --signal: oklch(0.72 0.17 330);
  --signal-text: oklch(0.80 0.15 330);
  --signal-fg: oklch(0.18 0.01 330);
  --signal-muted: oklch(0.28 0.05 330);
  --signal-ring: oklch(0.72 0.17 330 / 0.45);
}
```

Hue 330 is chosen to sit clear of `warn`, `ok` and `danger` and to be unmistakable against seeker violet (282) and recruiter teal (185).

- [ ] **Step 6: Run the contrast audit and adjust**

Start a dev server, then run: `node frontend/tests/visual/contrast.mjs`
Expected: every admin pairing clears 4.5:1 in both themes. If a light-theme pairing falls short, **lower the lightness** of `--signal-text` in 0.02 steps and re-run — the same treatment `--warn` and `--ok` already receive. Do not raise chroma to compensate. Record the final measured ratios in the commit message.

- [ ] **Step 7: Run the colour lint and the web tests**

Run: `npm run lint:colour --workspace @jobportal/web && npm test --workspace @jobportal/web -- portalScope`
Expected: colour lint still reports exactly the 18 known violations and no new one; portalScope passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/portalRoutes.ts frontend/src/lib/portal.ts frontend/src/index.css \
  frontend/tests/portalScope.test.tsx
git commit -m "feat(web): three-way portal resolution and admin signal tokens"
```

---

### Task 12: Frontend — move the recruiter workspace to `/hire/*`

**Files:**
- Modify: `frontend/src/App.tsx:62-67`
- Modify: `frontend/src/components/admin/ProtectedRoute.tsx`
- Modify: `frontend/src/components/admin/{AdminJobs,Companies,CompanyCreate,CompanySetup,PostJob}.tsx`
- Modify: `frontend/src/components/auth/Login.tsx:45,60`, `frontend/src/components/auth/AuthComplete.tsx:32`
- Test: `frontend/tests/routing.test.tsx`

**Interfaces:**
- Consumes: `portalForPath` from Task 11.
- Produces: `ProtectedRoute` taking `portal: Portal` as a required prop.

- [ ] **Step 1: Find every hard-coded link**

Run: `grep -rn '"/admin' frontend/src --include=*.tsx --include=*.ts | wc -l`
Expected: **23**. Every one is accounted for in this task. If the count differs, reconcile before proceeding — a missed literal becomes a dead link, not a compile error.

- [ ] **Step 2: Write the failing test**

Append to `frontend/tests/routing.test.tsx`:

```tsx
describe("recruiter workspace lives under /hire", () => {
  it("redirects the old admin workspace path to its hire equivalent", async () => {
    renderRoute("/admin/companies");
    await waitFor(() => expect(window.location.pathname).toBe("/hire/companies"));
  });

  it("renders the recruiter workspace for an approved recruiter", async () => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "r1", portal: "recruiter", fullName: "Rec", email: "r@example.com",
        emailVerified: true, avatarUrl: null, status: "active",
      }),
    );
    store.dispatch(setBootstrapped(true));
    renderRoute("/hire/companies", { store });
    expect(await screen.findByText(/companies/i)).toBeInTheDocument();
  });

  it("keeps a seeker out of the recruiter workspace", async () => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "s1", portal: "seeker", fullName: "Seek", email: "s@example.com",
        emailVerified: true, avatarUrl: null, status: "active",
      }),
    );
    store.dispatch(setBootstrapped(true));
    renderRoute("/hire/companies", { store });
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
```

Match `renderRoute`'s real signature in `frontend/tests/helpers/renderRoute.tsx` — always use its `makeStore()`, never the app's `@/redux/store`.

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test --workspace @jobportal/web -- routing`
Expected: FAIL — `/hire/companies` does not exist.

- [ ] **Step 4: Make `ProtectedRoute` take the portal as a prop**

`frontend/src/components/admin/ProtectedRoute.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Portal } from "@jobportal/shared";
import { useAppSelector } from "@/redux/store";

type ProtectedRouteProps = {
  children: ReactNode;
  /** The portal this subtree belongs to. A route literal, exactly like the
   *  API's `authenticate(portal)` — never read from state or a control. */
  portal: Portal;
};

/**
 * Client-side guard only — it hides UI, it does not protect data. Every
 * recruiter and admin route is also authorized server-side.
 */
const ProtectedRoute = ({ children, portal }: ProtectedRouteProps) => {
  const { user, bootstrapped } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    // Waiting for /me is not the same as being signed out.
    if (!bootstrapped) return;
    if (!user || user.portal !== portal) navigate("/", { replace: true });
  }, [user, bootstrapped, navigate, portal]);

  if (!bootstrapped || !user || user.portal !== portal) return null;
  return <>{children}</>;
};

export default ProtectedRoute;
```

- [ ] **Step 5: Move the routes and add redirects**

In `frontend/src/App.tsx`, replace the six `/admin/*` route objects with `/hire/*` equivalents passing `portal="recruiter"`, and add redirects from the old paths:

```tsx
import { Navigate } from "react-router-dom";

// ...inside children:
{ path: "/hire/companies", element: <ProtectedRoute portal="recruiter"><Companies /></ProtectedRoute> },
{ path: "/hire/companies/create", element: <ProtectedRoute portal="recruiter"><CompanyCreate /></ProtectedRoute> },
{ path: "/hire/companies/:id", element: <ProtectedRoute portal="recruiter"><CompanySetup /></ProtectedRoute> },
{ path: "/hire/jobs", element: <ProtectedRoute portal="recruiter"><AdminJobs /></ProtectedRoute> },
{ path: "/hire/jobs/create", element: <ProtectedRoute portal="recruiter"><PostJob /></ProtectedRoute> },
{ path: "/hire/jobs/:id/applicants", element: <ProtectedRoute portal="recruiter"><Applicants /></ProtectedRoute> },

// Old workspace paths. /admin now belongs to the admin portal, so these must
// not 404 for a bookmarked recruiter.
{ path: "/admin/companies", element: <Navigate to="/hire/companies" replace /> },
{ path: "/admin/companies/create", element: <Navigate to="/hire/companies/create" replace /> },
{ path: "/admin/jobs", element: <Navigate to="/hire/jobs" replace /> },
{ path: "/admin/jobs/create", element: <Navigate to="/hire/jobs/create" replace /> },
```

- [ ] **Step 6: Update every in-component navigation**

Replace the `navigate("/admin/...")` literals with their `/hire/...` equivalents in `AdminJobs.tsx:29`, `Companies.tsx:26`, `CompanyCreate.tsx:57`, `CompanySetup.tsx:59,89`, `PostJob.tsx:56`, and the three post-login redirects in `Login.tsx:45`, `Login.tsx:60` and `AuthComplete.tsx:32` (each of which sends a recruiter to `/admin/companies` today).

- [ ] **Step 7: Verify no stale literal survives**

Run: `grep -rn '"/admin' frontend/src --include=*.tsx --include=*.ts`
Expected: only the four `Navigate` redirect route definitions in `App.tsx`.

- [ ] **Step 8: Run the web tests**

Run: `npm test --workspace @jobportal/web`
Expected: PASS. Update any existing test that asserted an `/admin/*` destination.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components frontend/tests
git commit -m "refactor(web): move the recruiter workspace to /hire"
```

---

### Task 13: Frontend — admin auth route and the pending-recruiter state

**Files:**
- Modify: `frontend/src/routes/authRoutes.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/AdminLogin.tsx` (thin wrapper if `Login` needs no change)
- Modify: the recruiter workspace entry component
- Test: `frontend/tests/adminPortal.test.tsx` (create)

**Interfaces:**
- Consumes: `SessionUser.status` from Task 4; `portalForPath` from Task 11.
- Produces: `/admin/login`; a pending recruiter sees an awaiting-approval state.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/adminPortal.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderRoute, makeStore } from "./helpers/renderRoute";
import { setBootstrapped, setUser } from "@/redux/authSlice";

describe("admin portal", () => {
  it("renders an admin sign-in at /admin/login", async () => {
    renderRoute("/admin/login");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("resolves the admin portal on /admin/login", () => {
    const { container } = renderRoute("/admin/login");
    expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe("admin");
  });

  it("offers no signup link on the admin portal", async () => {
    renderRoute("/admin/login");
    await waitFor(() => expect(screen.queryByText(/create one/i)).not.toBeInTheDocument());
  });

  it("shows a pending recruiter the awaiting-approval state, not the workspace", async () => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "r1", portal: "recruiter", fullName: "Pending Rec", email: "p@example.com",
        emailVerified: true, avatarUrl: null, status: "pending",
      }),
    );
    store.dispatch(setBootstrapped(true));
    renderRoute("/hire/companies", { store });
    expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new company/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace @jobportal/web -- adminPortal`
Expected: FAIL — `/admin/login` does not exist.

- [ ] **Step 3: Let `buildAuthRoutes` omit signup**

`frontend/src/routes/authRoutes.tsx`:

```tsx
/**
 * `withSignup` is false for admin: there is no self-service admin registration
 * on the API either (the admin router mounts no /register), so offering the
 * page would be a dead end.
 */
export function buildAuthRoutes(
  portal: Portal,
  prefix: string,
  options: { withSignup?: boolean } = {},
): RouteObject[] {
  const { withSignup = true } = options;
  const routes: RouteObject[] = [
    { path: `${prefix}/login`, element: <Login portal={portal} /> },
  ];
  if (withSignup) {
    routes.push({ path: `${prefix}/signup`, element: <Signup portal={portal} /> });
  }
  return routes;
}
```

- [ ] **Step 4: Mount the admin auth routes**

In `frontend/src/App.tsx`:

```tsx
      ...buildAuthRoutes("admin", "/admin", { withSignup: false }),
```

- [ ] **Step 5: Hide the signup cross-link on admin**

In `Login.tsx`, wrap the "Don't have an account? Create one" block and the "Hiring instead?" cross-link in `{portal !== "admin" && ( ... )}` so the admin sign-in offers no dead-end links.

- [ ] **Step 6: Render the pending state**

In the recruiter workspace entry component, before rendering the workspace body.
`EmptyState` takes a **required `icon`** (a `LucideIcon`), so import one:

```tsx
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

// ...inside the component, after the auth selector:
if (user?.portal === "recruiter" && user.status === "pending") {
  return (
    <EmptyState
      icon={Clock}
      title="Awaiting approval"
      description="An admin is reviewing your recruiter account. You'll get an email as soon as it's approved, and you can post roles then."
    />
  );
}
```

Keep it inside the page's existing `PageShell` so spacing still comes from the
shell's density rather than the component.

- [ ] **Step 7: Run the web tests**

Run: `npm test --workspace @jobportal/web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/authRoutes.tsx frontend/src/App.tsx frontend/src/components \
  frontend/tests/adminPortal.test.tsx
git commit -m "feat(web): admin sign-in route and the pending-recruiter state"
```

---

### Task 14: Full verification and documentation

**Files:**
- Modify: `CLAUDE.md`, `ARCHITECTURE.md`, `SECURITY.md`, `README.md`

- [ ] **Step 1: Run the full CI in the background**

Run: `npm run ci`
Expected: PASS. It takes >120s — run it backgrounded and read the log rather than blocking.

- [ ] **Step 2: Drive the real app**

Start both servers. Confirm by hand: a new recruiter registration lands pending and is refused from posting a job with 403 `RECRUITER_PENDING_APPROVAL`; `seed:admin` produces a working admin login; the admin approves the recruiter and the recruiter can then post; `/admin/companies` redirects to `/hire/companies`; `/admin/login` shows admin magenta and `/hire/login` teal.

- [ ] **Step 3: Confirm the colour lint has not regressed**

Run: `npm run lint:colour --workspace @jobportal/web`
Expected: exactly the 18 known pre-existing violations, no new one.

- [ ] **Step 4: Update the living docs**

In `CLAUDE.md`: `Portal` is now three values; the recruiter workspace is at `/hire/*` and `/admin/*` is the admin portal; recruiters are pending until approved; `requireApproved` is the one deliberate 403 exception to the 404 ownership rule; `authenticateAny`/`optionalAuthenticate` deliberately exclude admin; add `seed:admin` and `migrate:phase3a` to the command table.

In `ARCHITECTURE.md`: the three-portal middleware chain and the identity/authorization split.

In `SECURITY.md`: recruiter self-registration and the Google self-provisioning path are both closed.

In `README.md`: the `seed:admin` bootstrap step.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md SECURITY.md README.md
git commit -m "docs: bring the living docs up to Phase 3A"
```

---

## Self-Review

**Spec coverage.** §1 → Task 1 + ADR-0006. §2 → Tasks 2, 3, 4, 7. §3 → Tasks 5, 6. §4 → Tasks 6, 9. §5 → Tasks 11, 12, 13. §6 → Task 11 (steps 5–6). §7 → Task 10. Testing section → the test steps in every task plus Task 14. No spec requirement is unimplemented.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every symbol the plan writes against was read from the codebase first and is used with its real name: `applyAuthIndexes`, `defineModel`, `AppError.forbidden/notFound/unauthorized`, `findAccountById(portal, id)` (which returns a thenable Query, awaited exactly as `authenticate.ts:33` does), `Rendered` + `WRAPPER` in `emailTemplates.ts`, `EmptyState`'s required `icon` prop, the chained `router.route(path).verb(...)` style, and `migrate-phase1c.ts`'s `invokedDirectly` regex guard. Two steps remain conditional by design — Task 4 step 4 ("if more than one site builds this literal, extract `toSessionUser`") and Task 9 step 3 ("if `auth.service.ts` exports no OTP helper, export the private `issueOtp`") — because both depend on a shape the plan names precisely but should not guess at blind.

**Corrections applied during review.** Four claims were wrong on first draft and were fixed against the source: the DB helpers are `connectDB(uri)`/`disconnectDB()`, not `connectDb`/`disconnectDb`; the domain routers use `router.route().verb()`, not `router.post()`; `EmptyState` requires an `icon`; and there are **no job update or delete routes**, so Task 7 gates only `/post`, the two company mutations and the two applicant routes.

**Type consistency.** `Portal` gains `"admin"` in Task 1 and is used unchanged after. `AccountStatus` is defined in Task 4 and consumed in Tasks 4, 7, 13. `requireApproved` keeps that name in Tasks 7 and 14. `seedAdmin` keeps its `SeedAdminInput` shape in Task 9. `migratePhase3a` returns `{ grandfathered, droppedUsers }` in Task 10 and its tests assert exactly those keys. `ProtectedRoute`'s `portal` prop is introduced in Task 12 and used in Tasks 12 and 13. `buildAuthRoutes`'s third parameter is introduced and consumed in Task 13. `portalForPath` keeps its signature throughout.

**Known ordering constraint.** Task 7 makes pre-existing recruiter tests fail, because `signedUpOn("recruiter", ...)` now returns a pending account. Task 7 step 6 fixes them by approving in setup — never by weakening the middleware.
