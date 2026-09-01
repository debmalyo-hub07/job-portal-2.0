# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A kill-switch flag system: flags defined in shared code, overridden in Mongo, flipped from a new console screen, read by server and client.

**Architecture:** `packages/shared` owns the `FLAG_REGISTRY` (keys as a TS union + Zod schemas + DTOs). The backend adds a `FeatureFlag` model storing only deviations, a `flags.service.ts` resolving through a 15s in-memory cache (single-instance), admin GET/PUT routes, and a public `GET /flags`. The frontend adds a `useFlags()` hook and an `/admin/flags` console screen.

**Tech Stack:** Express 5, Mongoose, Zod, react-query, the existing console primitives (AdminShell, Table, Button).

**Spec:** `docs/superpowers/specs/2026-09-01-feature-flags-design.md`

## Global Constraints

- A flag is global on/off only. No per-portal, per-user, or percentage anything.
- Flags are defined ONLY in `FLAG_REGISTRY`; the DB stores only overrides. An unregistered key is a 400 on write and invisible on read.
- `flagEnabled` never throws for a registered key; a stale DB row for a removed key resolves to the registry default.
- The read cache TTL is 15s; `setFlag` invalidates it immediately.
- Admin routes each name `authenticate("admin")` (and `csrfProtection()` on writes) individually, per admin.route.ts convention.
- The public `GET /flags` needs no auth and returns resolved values only — no who/when.
- Backend tests run from `backend/` (`cd D:\job-portal-2.0\backend; npx vitest run tests/<file>`); running from the repo root silently skips setup and fails everything (known trap).
- Shared changes require rebuilding `@jobportal/shared` before frontend tests see them — the full battery handles this; after a shared-only edit run `npm run build --workspace @jobportal/shared` before frontend suites.
- No Co-Authored-By trailer in commit messages.

---

### Task 1: The shared registry

**Files:**
- Create: `packages/shared/src/flags.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./flags.js";`)
- Test: `packages/shared/tests/flags.test.ts`

**Interfaces:**
- Produces: `FLAG_REGISTRY`, `FlagKey` (union), `FLAG_KEYS`, `flagDefault(key)`, `flagKeySchema`, `setFlagBodySchema`, `AdminFlagDto`, `FlagsResponse` — consumed by every later task.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/flags.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  FLAG_KEYS,
  FLAG_REGISTRY,
  flagDefault,
  flagKeySchema,
  setFlagBodySchema,
} from "../src/flags.js";

describe("the flag registry", () => {
  it("has unique keys", () => {
    expect(new Set(FLAG_REGISTRY.map((flag) => flag.key)).size).toBe(FLAG_REGISTRY.length);
  });

  it("ships P4's auto-approve flag, off", () => {
    const flag = FLAG_REGISTRY.find((entry) => entry.key === "autoApproveRecruiterSignups");
    expect(flag?.default).toBe(false);
    expect(flag?.description).toMatch(/reserved/i);
  });

  it("defaults a key to its registry default", () => {
    expect(flagDefault("autoApproveRecruiterSignups")).toBe(false);
  });

  it("validates keys and bodies", () => {
    expect(flagKeySchema.safeParse("autoApproveRecruiterSignups").success).toBe(true);
    expect(flagKeySchema.safeParse("not-a-flag").success).toBe(false);
    expect(setFlagBodySchema.safeParse({ enabled: true }).success).toBe(true);
    expect(setFlagBodySchema.safeParse({ enabled: "yes" }).success).toBe(false);
    expect(FLAG_KEYS).toContain("autoApproveRecruiterSignups");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/flags.test.ts`
Expected: FAIL — `../src/flags.js` does not exist.

- [ ] **Step 3: Implement**

Create `packages/shared/src/flags.ts`:

```ts
import { z } from "zod";

/**
 * The platform's feature flags — P3 of the console automation program.
 *
 * Defined in code, overridden in the database: the registry is the source of
 * truth for what exists (a typo is a compile error, a default ships in the PR
 * that introduces the behavior), and the `FeatureFlag` collection stores only
 * deviations — no row means the registry default. A global on/off per flag,
 * nothing finer: this is an operator's kill switch, not an experiment
 * platform (ADR-0009).
 */
export const FLAG_REGISTRY = [
  {
    key: "autoApproveRecruiterSignups",
    description:
      "Reserved for the approval automation: when on, recruiter signups that pass every strong signal are approved without a human review. Inert until that ships — leave off.",
    default: false,
  },
] as const satisfies readonly { key: string; description: string; default: boolean }[];

export type FlagKey = (typeof FLAG_REGISTRY)[number]["key"];

export const FLAG_KEYS: readonly FlagKey[] = FLAG_REGISTRY.map((flag) => flag.key);

/** The resolved value when no override row exists. */
export function flagDefault(key: FlagKey): boolean {
  return FLAG_REGISTRY.find((flag) => flag.key === key)?.default ?? false;
}

/** Route-param validation: an unregistered key is a 400, never a new flag. */
export const flagKeySchema = z.enum(FLAG_KEYS as [FlagKey, ...FlagKey[]]);

export const setFlagBodySchema = z.object({ enabled: z.boolean() });
export type SetFlagBody = z.infer<typeof setFlagBodySchema>;

/**
 * The console's read: every registry flag with its resolved value, plus —
 * where a row exists — who last flipped it and when.
 */
export type AdminFlagDto = {
  key: FlagKey;
  description: string;
  enabled: boolean;
  default: boolean;
  lastChangedBy: string | null;
  lastChangedAt: string | null;
};

/** The public read: resolved values only. Flag state is not a secret. */
export type FlagsResponse = {
  flags: Partial<Record<FlagKey, boolean>>;
};
```

Add to `packages/shared/src/index.ts` (after the location export):

```ts
export * from "./flags.js";
```

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\packages\shared; npx vitest run tests/flags.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Rebuild shared and commit**

Run: `cd D:\job-portal-2.0; npm run build --workspace @jobportal/shared`

```
git add packages/shared/src/flags.ts packages/shared/src/index.ts packages/shared/tests/flags.test.ts
git commit -m "feat(shared): the feature-flag registry and its schemas"
```

---

### Task 2: The flag model and service

**Files:**
- Create: `backend/src/models/featureFlag.model.ts`
- Create: `backend/src/services/flags.service.ts`
- Test: `backend/tests/flags.test.ts`

**Interfaces:**
- Consumes: everything from Task 1; `Admin` (`backend/src/models/admin.model.js`), `logger`, `mongoose.trusted` for `$in`.
- Produces: `flagEnabled(key: FlagKey): Promise<boolean>`, `resolvedFlags(): Promise<FlagsResponse["flags"]>`, `listFlags(): Promise<AdminFlagDto[]>`, `setFlag(key: FlagKey, enabled: boolean, adminId: string | null): Promise<void>` — consumed by Tasks 3 and (later) P4.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/flags.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { Admin } from "../src/models/admin.model.js";
import { FeatureFlag } from "../src/models/featureFlag.model.js";
import {
  flagEnabled,
  listFlags,
  resolvedFlags,
  setFlag,
} from "../src/services/flags.service.js";

async function adminRow(email: string) {
  return Admin.create({ email, fullName: "Admin", status: "active", emailVerifiedAt: new Date() });
}

describe("the flag service", () => {
  beforeEach(async () => {
    await Promise.all([FeatureFlag.init(), Admin.init()]);
  });

  it("answers the registry default when no row exists", async () => {
    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(false);
  });

  it("an override row wins, and a set is visible to the next read", async () => {
    const admin = await adminRow("flipper@admins.test");

    await setFlag("autoApproveRecruiterSignups", true, String(admin._id));

    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(true);
    expect((await resolvedFlags()).autoApproveRecruiterSignups).toBe(true);
  });

  it("listFlags resolves every registry flag and names the last flipper", async () => {
    const admin = await adminRow("listflipper@admins.test");
    await setFlag("autoApproveRecruiterSignups", true, String(admin._id));

    const flags = await listFlags();
    const entry = flags.find((flag) => flag.key === "autoApproveRecruiterSignups");

    expect(entry?.enabled).toBe(true);
    expect(entry?.default).toBe(false);
    expect(entry?.lastChangedBy).toBe("listflipper@admins.test");
    expect(entry?.lastChangedAt).not.toBeNull();
  });

  it("a stale row for a removed key is invisible", async () => {
    // A flag deleted from the registry leaves its row behind: writes of the
    // key now fail the model's enum, and reads must resolve to the default
    // rather than honor the ghost.
    await FeatureFlag.create({
      key: "autoApproveRecruiterSignups",
      enabled: true,
      lastChangedAt: new Date(),
    });
    await mongoose.connection.collection("featureflags").updateOne(
      { key: "autoApproveRecruiterSignups" },
      { $set: { key: "removedLongAgo" } },
    );

    expect(await flagEnabled("autoApproveRecruiterSignups")).toBe(false);
    expect((await listFlags()).every((flag) => flag.key !== "removedLongAgo")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/flags.test.ts`
Expected: FAIL — the model and service modules do not exist.

- [ ] **Step 3: Implement the model**

Create `backend/src/models/featureFlag.model.ts`:

```ts
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { FLAG_KEYS } from "@jobportal/shared";

import { defineModel } from "./defineModel.js";

/**
 * A flag's DEVIATION from its registry default — never the flag itself.
 * `enum: FLAG_KEYS` means a key removed from the registry can no longer be
 * written; its surviving row is skipped by reads (the registry is the source
 * of truth for what exists).
 */
const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, enum: [...FLAG_KEYS], unique: true },
    enabled: { type: Boolean, required: true },
    lastChangedBy: { type: Schema.Types.ObjectId, default: null },
    lastChangedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

export type FeatureFlagDocument = InferSchemaType<typeof featureFlagSchema>;
export const FeatureFlag: Model<FeatureFlagDocument> = defineModel<FeatureFlagDocument>(
  "FeatureFlag",
  featureFlagSchema,
);
```

- [ ] **Step 4: Implement the service**

Create `backend/src/services/flags.service.ts`:

```ts
import mongoose from "mongoose";
import {
  FLAG_REGISTRY,
  flagDefault,
  type AdminFlagDto,
  type FlagKey,
  type FlagsResponse,
} from "@jobportal/shared";

import { logger } from "../lib/logger.js";
import { Admin } from "../models/admin.model.js";
import { FeatureFlag } from "../models/featureFlag.model.js";

/**
 * The platform's flag resolution — P3 of the console automation program.
 *
 * Reads go through a small in-memory cache (15s), valid because the deploy is
 * single-instance — the same reasoning the in-memory rate-limit store rests
 * on. A flip is a kill switch measured in seconds: `setFlag` invalidates
 * immediately in this process, and the TTL is only the ceiling for rows
 * changed by some future second process that does not exist.
 */
const CACHE_TTL_MS = 15_000;

let cache: { at: number; overrides: Map<string, boolean> } | null = null;

async function overrides(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.overrides;
  const rows = await FeatureFlag.find({}).select("key enabled");
  const map = new Map(rows.map((row) => [row.key, row.enabled]));
  cache = { at: Date.now(), overrides: map };
  return map;
}

/** What the server acts on: the override where present, the default if not. */
export async function flagEnabled(key: FlagKey): Promise<boolean> {
  const map = await overrides();
  // A stale row for a removed key cannot be looked up by a registered key, so
  // the ghost is invisible by construction.
  return map.get(key) ?? flagDefault(key);
}

/** The public read: resolved values for every registry key, nothing else. */
export async function resolvedFlags(): Promise<FlagsResponse["flags"]> {
  const map = await overrides();
  const flags: FlagsResponse["flags"] = {};
  for (const flag of FLAG_REGISTRY) {
    flags[flag.key] = map.get(flag.key) ?? flag.default;
  }
  return flags;
}

/** The console's read: the registry with resolved state and last-flip detail. */
export async function listFlags(): Promise<AdminFlagDto[]> {
  const rows = await FeatureFlag.find({});
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  const adminIds = [
    ...new Set(rows.map((row) => (row.lastChangedBy ? String(row.lastChangedBy) : null)).filter((id): id is string => id !== null)),
  ];
  const admins = adminIds.length
    ? await Admin.find({ _id: mongoose.trusted({ $in: adminIds }) }).select("email")
    : [];
  const emailById = new Map(admins.map((admin) => [String(admin._id), admin.email]));

  return FLAG_REGISTRY.map((flag) => {
    const row = rowByKey.get(flag.key);
    return {
      key: flag.key,
      description: flag.description,
      enabled: row?.enabled ?? flag.default,
      default: flag.default,
      lastChangedBy: row?.lastChangedBy ? emailById.get(String(row.lastChangedBy)) ?? null : null,
      lastChangedAt: row?.lastChangedAt ? row.lastChangedAt.toISOString() : null,
    };
  });
}

/** The console's write: upsert the override, record the flip, drop the cache. */
export async function setFlag(
  key: FlagKey,
  enabled: boolean,
  adminId: string | null,
): Promise<void> {
  await FeatureFlag.updateOne(
    { key },
    { $set: { enabled, lastChangedBy: adminId, lastChangedAt: new Date() } },
    { upsert: true },
  );
  cache = null;
  logger.info({ key, enabled, adminId }, "feature flag changed");
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/flags.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```
git add backend/src/models/featureFlag.model.ts backend/src/services/flags.service.ts backend/tests/flags.test.ts
git commit -m "feat(api): the feature-flag model and resolution service"
```

---

### Task 3: The routes

**Files:**
- Modify: `backend/src/controllers/admin.controller.ts` (add `listFlags`, `setFlag`)
- Modify: `backend/src/routes/admin.route.ts` (two entries)
- Create: `backend/src/routes/flags.route.ts` (the public read)
- Modify: `backend/src/app.ts` (mount `/api/v1/flags`)
- Test: `backend/tests/flags.routes.test.ts`

**Interfaces:**
- Consumes: Task 2's service functions; `flagKeySchema`/`setFlagBodySchema` from Task 1; `parseBody` and the auth/CSRF middleware already in the controller/route files.
- Produces: `GET /api/v1/admin/flags`, `PUT /api/v1/admin/flags/:key`, `GET /api/v1/flags`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/flags.routes.test.ts` (the signedInAdmin shape is approval.test.ts's, reproduced locally):

```ts
import request from "supertest";
import type { Test as SupertestRequest } from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { Admin } from "../src/models/admin.model.js";
import { FeatureFlag } from "../src/models/featureFlag.model.js";
import { cookieValue, installCaptureMailer, lastCodeFor } from "./auth/helpers.js";

const app = buildApp();
const PASSWORD = "correct horse battery staple";

async function signedInAdmin(email: string): Promise<{ access: string; csrf: string }> {
  await Admin.create({
    email,
    fullName: "Root Admin",
    passwordHash: null,
    emailVerifiedAt: new Date(),
    status: "active",
  });
  await request(app).post("/api/v1/admin/auth/forgot-password").send({ email });
  const code = await lastCodeFor(email);
  await request(app)
    .post("/api/v1/admin/auth/reset-password")
    .send({ email, code, newPassword: PASSWORD });
  const login = await request(app)
    .post("/api/v1/admin/auth/login")
    .send({ email, password: PASSWORD });
  return {
    access: cookieValue(login, "jp_admin_at")!,
    csrf: cookieValue(login, "jp_admin_csrf")!,
  };
}

const asAdmin = (session: { access: string; csrf: string }) => (test: SupertestRequest): void => {
  test.set("Cookie", [`jp_admin_at=${session.access}`, `jp_admin_csrf=${session.csrf}`]);
  test.set("X-CSRF-Token", session.csrf);
};

describe("the admin flag routes", () => {
  beforeEach(() => installCaptureMailer());

  it("lists the registry with resolved values", async () => {
    const admin = await signedInAdmin("reader@admins.test");
    const res = await request(app).get("/api/v1/admin/flags").use(asAdmin(admin)).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.flags).toEqual([
      expect.objectContaining({ key: "autoApproveRecruiterSignups", enabled: false, default: false }),
    ]);
  });

  it("refuses an anonymous caller and a session without CSRF", async () => {
    const admin = await signedInAdmin("gate@admins.test");
    await request(app).get("/api/v1/admin/flags").expect(401);
    await request(app)
      .put("/api/v1/admin/flags/autoApproveRecruiterSignups")
      .set("Cookie", [`jp_admin_at=${admin.access}`])
      .send({ enabled: true })
      .expect(403);
  });

  it("flips a registered flag and records the flipper", async () => {
    const admin = await signedInAdmin("flipper@admins.test");
    await request(app)
      .put("/api/v1/admin/flags/autoApproveRecruiterSignups")
      .use(asAdmin(admin))
      .send({ enabled: true })
      .expect(200);

    const res = await request(app).get("/api/v1/admin/flags").use(asAdmin(admin)).expect(200);
    expect(res.body.flags[0]).toMatchObject({
      key: "autoApproveRecruiterSignups",
      enabled: true,
      lastChangedBy: "flipper@admins.test",
    });
  });

  it("refuses an unregistered key with 400, creating nothing", async () => {
    const admin = await signedInAdmin("strict@admins.test");
    const res = await request(app)
      .put("/api/v1/admin/flags/not-a-flag")
      .use(asAdmin(admin))
      .send({ enabled: true })
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await FeatureFlag.countDocuments({})).toBe(0);
  });
});

describe("the public flag read", () => {
  beforeEach(() => installCaptureMailer());

  it("answers resolved values with no auth", async () => {
    const res = await request(app).get("/api/v1/flags").expect(200);
    expect(res.body).toEqual({
      success: true,
      flags: { autoApproveRecruiterSignups: false },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/flags.routes.test.ts`
Expected: FAIL — `/api/v1/admin/flags` and `/api/v1/flags` answer 404.

- [ ] **Step 3: Implement the controllers and routes**

In `backend/src/controllers/admin.controller.ts` (follow the existing imports — add `flagKeySchema`, `setFlagBodySchema` to the shared import list, and the flags service import):

```ts
export const listFlags = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, flags: await flagsService.listFlags() });
};

export const setFlag = async (req: Request, res: Response): Promise<void> => {
  // Registry validation at the boundary: an unregistered key is a 400, never
  // a silently created flag.
  const key = parseBody(flagKeySchema, req.params.key);
  const { enabled } = parseBody(setFlagBodySchema, req.body);
  await flagsService.setFlag(key, enabled, req.auth?.id ? String(req.auth.id) : null);
  res.status(200).json({ success: true });
};
```

In `backend/src/routes/admin.route.ts` (with the other routes; import the two controllers):

```ts
router.route("/flags").get(authenticate("admin"), listFlags);
router.route("/flags/:key").put(authenticate("admin"), csrfProtection(), setFlag);
```

Create `backend/src/routes/flags.route.ts`:

```ts
import express from "express";

import { resolvedFlags } from "../services/flags.service.js";

/**
 * The public flag read — P3 of the console automation program. Unauthenticated
 * on purpose (flag state is not a secret, and the client needs it to branch
 * UI); answers resolved values only, never who flipped what.
 */
const router = express.Router();

router.get("/", async (_req, res) => {
  res.status(200).json({ success: true, flags: await resolvedFlags() });
});

export default router;
```

In `backend/src/app.ts` (import beside locationRoute; mount beside it):

```ts
app.use("/api/v1/flags", flagsRoute);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd D:\job-portal-2.0\backend; npx vitest run tests/flags.routes.test.ts tests/flags.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```
git add backend/src/controllers/admin.controller.ts backend/src/routes/admin.route.ts backend/src/routes/flags.route.ts backend/src/app.ts backend/tests/flags.routes.test.ts
git commit -m "feat(api): the admin flag routes and the public flag read"
```

---

### Task 4: The console screen

**Files:**
- Create: `frontend/src/hooks/useFlags.ts` (the public read hook)
- Modify: `frontend/src/hooks/useAdminConsole.tsx` (add `useAdminFlags`, `useSetFlag`)
- Create: `frontend/src/components/console/AdminFlags.tsx`
- Modify: `frontend/src/components/shared/navLinks.ts` (admin section — sixth entry)
- Modify: `frontend/src/routes/appRoutes.tsx` (import + route)
- Test: `frontend/tests/flags.test.tsx`

**Interfaces:**
- Consumes: `AdminFlagDto`, `FlagKey` from shared; `apiClient`; `AdminShell`; the console primitives.
- Produces: `useFlags()` (public), `useAdminFlags()` + `useSetFlag()` (console), the `/admin/flags` screen.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/flags.test.tsx` (the harness is `adminDashboard.test.tsx`'s: `render` from `@testing-library/react`, `makeStore` from `./helpers/renderRoute`):

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";

import AdminFlags from "@/components/console/AdminFlags";
import { useFlags } from "@/hooks/useFlags";
import { apiClient } from "@/lib/apiClient";
import { makeStore } from "./helpers/renderRoute";

const mutate = vi.fn();
// The one piece of mutable mock state: the failing-flip test flips it before
// rendering. vi.mock factories close over hoisted values, so this is how a
// single mock changes shape between tests.
const mockState = vi.hoisted(() => ({ failFlip: false }));

const fixtures = vi.hoisted(() => ({
  flags: [
    {
      key: "autoApproveRecruiterSignups" as const,
      description: "Reserved for the approval automation.",
      enabled: false,
      default: false,
      lastChangedBy: "flipper@admins.test",
      lastChangedAt: "2026-09-01T12:00:00.000Z",
    },
  ],
}));

vi.mock("@/hooks/useAdminConsole", () => ({
  useAdminFlags: () => ({ data: fixtures.flags, isPending: false, isError: false, error: null }),
  useSetFlag: () => ({
    mutate,
    isPending: false,
    isError: mockState.failFlip,
    error: new Error("nope"),
  }),
}));

function renderFlags() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <AdminFlags />
      </MemoryRouter>
    </Provider>,
  );
}

describe("the Flags console screen", () => {
  beforeEach(() => {
    mutate.mockClear();
    mockState.failFlip = false;
  });

  it("renders the registry flag with its state and last flipper", () => {
    renderFlags();
    expect(screen.getByText("autoApproveRecruiterSignups")).toBeInTheDocument();
    expect(screen.getByText(/reserved for the approval automation/i)).toBeInTheDocument();
    expect(screen.getByText(/flipper@admins\.test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn on/i })).toBeInTheDocument();
  });

  it("flips through the mutation when the toggle is clicked", async () => {
    renderFlags();
    await userEvent.click(screen.getByRole("button", { name: /turn on/i }));
    expect(mutate).toHaveBeenCalledWith({
      key: "autoApproveRecruiterSignups",
      enabled: true,
    });
  });

  it("surfaces a failed flip rather than silently doing nothing", () => {
    mockState.failFlip = true;
    renderFlags();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not flip/i);
  });
});

describe("useFlags", () => {
  it("resolves values from the public endpoint", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { success: true, flags: { autoApproveRecruiterSignups: false } },
    });
    vi.spyOn(apiClient, "get").mockImplementation(get);

    let resolved: { autoApproveRecruiterSignups?: boolean } | undefined;
    function Probe() {
      const flags = useFlags();
      resolved = flags.data;
      return null;
    }
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Probe />
        </MemoryRouter>
      </Provider>,
    );

    await vi.waitFor(() => expect(resolved).toEqual({ autoApproveRecruiterSignups: false }));
    expect(get).toHaveBeenCalledWith("/flags");
  });
});
```


- [ ] **Step 2: Run to verify failure**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/flags.test.tsx`
Expected: FAIL — `@/components/console/AdminFlags` and `@/hooks/useFlags` do not exist.

- [ ] **Step 3: Implement the hooks**

Create `frontend/src/hooks/useFlags.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import type { FlagsResponse } from "@jobportal/shared";

/**
 * The public flag read — flags are not a secret, and the client branches UI
 * on the same resolution the server acts on. Never used to gate anything the
 * server does not independently enforce.
 */
export function useFlags() {
  return useQuery({
    queryKey: ["flags"],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean } & FlagsResponse>("/flags");
      return res.data.flags;
    },
    staleTime: 30_000,
  });
}
```

Append to `frontend/src/hooks/useAdminConsole.tsx`:

```ts
export function useAdminFlags() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "flags"],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<{ success: boolean; flags: AdminFlagDto[] }>("/admin/flags", {
        signal,
      });
      return res.data.flags;
    },
  });
}

export function useSetFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: FlagKey; enabled: boolean }) => {
      await apiClient.put(`/admin/flags/${input.key}`, { enabled: input.enabled });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "flags"] });
    },
  });
}
```

(Extend the file's imports: `AdminFlagDto`, `FlagKey` from `@jobportal/shared`.)

- [ ] **Step 4: Implement the screen**

Create `frontend/src/components/console/AdminFlags.tsx`:

```tsx
import { Loader2 } from "lucide-react";

import AdminShell from "./AdminShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminFlags, useSetFlag } from "@/hooks/useAdminConsole";

/**
 * The console's flag surface — P3 of the console automation program.
 *
 * A control surface, not a settings page: the registry holds a handful of
 * flags at most, every row is one global kill switch, and the last flipper is
 * named because a switch nobody can attribute is a switch nobody trusts.
 */
export function AdminFlags() {
  const flags = useAdminFlags();
  const setFlag = useSetFlag();

  return (
    <AdminShell
      title="Feature flags"
      description="Platform-wide switches. Changes apply within seconds."
    >
      {setFlag.isError ? (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          Could not flip that flag:{" "}
          {setFlag.error instanceof Error ? setFlag.error.message : "unknown error"}
        </p>
      ) : null}
      {flags.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load the flags:{" "}
          {flags.error instanceof Error ? flags.error.message : "unknown error"}
        </p>
      ) : flags.isPending || !flags.data ? (
        <Skeleton className="h-24 rounded-surface" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Last changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.data.map((flag) => (
              <TableRow key={flag.key}>
                <TableCell className="max-w-md">
                  <p className="font-mono text-sm font-medium text-ink">{flag.key}</p>
                  <p className="mt-1 text-xs text-ink-muted">{flag.description}</p>
                </TableCell>
                <TableCell>
                  <Button
                    variant={flag.enabled ? "signal" : "outline"}
                    size="sm"
                    aria-pressed={flag.enabled}
                    disabled={setFlag.isPending}
                    onClick={() =>
                      setFlag.mutate({ key: flag.key, enabled: !flag.enabled })
                    }
                  >
                    {setFlag.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                    {flag.enabled ? "On" : "Turn on"}
                  </Button>
                </TableCell>
                <TableCell className="text-xs text-ink-muted">
                  {flag.lastChangedBy && flag.lastChangedAt
                    ? `${flag.lastChangedBy}, ${new Date(flag.lastChangedAt).toLocaleString()}`
                    : "Never changed (registry default)"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminShell>
  );
}

export default AdminFlags;
```

In `frontend/src/components/shared/navLinks.ts`, add to the admin case after Companies:

```ts
        { to: "/admin/flags", label: "Flags" },
```

In `frontend/src/routes/appRoutes.tsx`: import `AdminFlags from "@/components/console/AdminFlags";` beside the other console imports, and mount it in the admin console children beside the other screens:

```tsx
          { path: "/admin/flags", element: adminConsole(<AdminFlags />) },
```

(Match the exact shape of the neighboring admin children entries — read them before writing.)

- [ ] **Step 5: Run to verify pass**

Run: `cd D:\job-portal-2.0\frontend; npx vitest run tests/flags.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add frontend/src/hooks/useFlags.ts frontend/src/hooks/useAdminConsole.tsx frontend/src/components/console/AdminFlags.tsx frontend/src/components/shared/navLinks.ts frontend/src/routes/appRoutes.tsx frontend/tests/flags.test.tsx
git commit -m "feat(web): the Flags console screen and the useFlags hook"
```

---

### Task 5: Documentation and the full battery

**Files:**
- Create: `docs/adr/0009-feature-flags-kill-switch.md`
- Modify: `ARCHITECTURE.md` (a Feature flags subsection after the automation paragraphs)
- Modify: `frontend/src/data/updates.ts` (newest-first entry)

**Interfaces:** none.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0009-feature-flags-kill-switch.md`:

```markdown
# ADR-0009: Feature flags are an operator's kill switch

Date: 2026-09-01

## Status

Accepted.

## Context

The console automation program's approval tier (P4) must ship off and be
killable at runtime without a deploy. The platform has no such mechanism:
behaviour is compiled in or read from environment variables, and both need a
rebuild.

## Decision

A flag registry in `packages/shared` (`FLAG_REGISTRY`) defines every flag,
its description and its default; a `FeatureFlag` collection stores only
deviations; an admin console screen flips them. Flags are global on/off
only. Server reads resolve through a 15-second in-memory cache, valid
because the deploy is single-instance — the same reasoning as the
in-memory rate-limit store (ADR-0004's world).

This is deliberately an operator's kill switch, not an experiment platform:
no percentage rollouts, no per-user or per-portal targeting, no scheduling.
The registry-in-code design makes a typo a compile error and a default a
reviewed PR; the database cannot accumulate flags nobody reads.

## Consequences

- A second API instance breaks the cache's freshness ceiling (still correct
  within 15s per process) and is the trigger to move resolution to a shared
  store — multi-instance is also what ADR-0004 defers.
- Per-portal granularity, if ever real, is a scope field on the override row
  and one step in the resolver — contained, not a rewrite.
- Percentage rollouts or targeting are out of scope permanently unless a
  future ADR replaces this one; they change both the store and the trust
  model.
```

- [ ] **Step 2: The ARCHITECTURE section and the release note**

In `ARCHITECTURE.md`, after the orphan-sweep paragraph, add:

```markdown
### Feature flags

Flags are an operator's kill switch, not an experiment platform (ADR-0009).
`FLAG_REGISTRY` in `packages/shared` defines every flag — key, description,
default — and the keys are a TypeScript union, so a typo is a compile error
and a default ships in the PR that introduces the behavior. The
`FeatureFlag` collection stores only deviations from those defaults; reads
resolve through a 15-second in-memory cache (single-instance, like the
rate-limit store) and `setFlag` invalidates immediately. The console's
Flags screen (`/admin/flags`) lists the registry and flips flags, recording
who and when; `GET /flags` answers the resolved values publicly so the
client branches on the same resolution the server acts on. The registry
ships with `autoApproveRecruiterSignups`, off, reserved for P4's approval
automation and inert until that wires it.
```

In `frontend/src/data/updates.ts`, newest-first entry:

```ts
  {
    id: "feature-flags",
    date: "2026-09-01",
    kind: "Feature",
    title: "The console gains a Flags screen",
    summary:
      "Admins can now flip platform-wide feature switches from the console — each switch says what it does, what its default is, and who last changed it. The first switch is reserved for the upcoming approval automation and ships off.",
    details: [
      "Switches take effect within seconds, without a redeploy, and every change is attributed.",
      "Nothing user-facing changes yet — the first switch is reserved and inert until the automation it guards ships.",
    ],
  },
```

- [ ] **Step 3: Run the full battery**

Run: `cd D:\job-portal-2.0; npm run ci; npm run audit:prod`
Expected: exit 0 — all suites, typecheck, lint, colour gate, builds, audit. (If one unrelated test flakes under load, re-run it in isolation; stop dev servers first.)

- [ ] **Step 4: `git diff --check`, report, and ask before pushing**

Run: `cd D:\job-portal-2.0; git diff --check; git status --short`
Expected: clean. Commit the docs, report battery results, ask before pushing — a push deploys both hosts.
```
git add docs/adr/0009-feature-flags-kill-switch.md ARCHITECTURE.md frontend/src/data/updates.ts
git commit -m "docs: ADR-0009, the flag path, and the Flags release note"
```
