# Phase 1A — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing JavaScript job portal into a typed npm-workspaces monorepo with validated configuration, real error handling, structured logging, security middleware, a working test harness, CI, and a complete documentation set — with no change to application behavior.

**Architecture:** `apps/api` and `apps/web` become npm workspaces alongside `packages/shared`, which holds Zod schemas both ends import so client and server cannot disagree about an API shape. The Express app is split into `app.ts` (wiring, exported without listening) and `server.ts` (listen + graceful shutdown) so Supertest can mount the app directly. Cross-cutting concerns — config, errors, logging, rate limiting — move behind small modules with single responsibilities.

**Tech Stack:** Node 20+, TypeScript 5.9 (NodeNext), Express 5.1, Mongoose 8, Zod 4, Vitest 3, Supertest 7, mongodb-memory-server 10, Pino 9, Helmet 8, GitHub Actions.

## Global Constraints

- **Node >= 20.19.** Vite 7.3 refuses anything below `20.19.0 || >=22.12.0`. It currently *warns and still runs* on 20.18, but that is not a supported configuration and should not be relied on.
- **ESM throughout.** Every `package.json` sets `"type": "module"`.
- **`moduleResolution: "NodeNext"`.** This means **every relative import must carry a `.js` extension**, even when the source file is `.ts` — `import { env } from "./config/env.js"`. This is the single most common mistake in this migration. TypeScript will not warn you in every case; Node will fail at runtime.
- **No behavior changes in Phase 1A.** Endpoints keep their current paths, methods, and response shapes. Security fixes to those endpoints belong to plans 1B and 1C. The one exception is the error envelope, which is additive.
- **Secrets never enter the repo.** Only `.env.example` is committed, and it holds names with empty values.
- **`SECRET_KEY` is renamed `JWT_ACCESS_SECRET`.** The old name's value is public (see spec, Phase 0). Renaming makes reusing the leaked value impossible by accident.
- **Commit after every task.** Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- **Every task must leave `npm run typecheck` and `npm test` passing** at the repository root.

---

## File Structure

```
package.json                     workspace root, scripts delegate to workspaces
tsconfig.base.json               shared compiler options
.env.example                     documented variable names, no values
.github/workflows/ci.yml         typecheck → lint → test → build

packages/shared/
  package.json
  tsconfig.json
  src/index.ts                   barrel export
  src/enums.ts                   JobType, WorkMode, ApplicationStatus, Portal
  src/pagination.ts              paginationQuerySchema, PaginatedResponse<T>
  tests/enums.test.ts

apps/api/
  package.json
  tsconfig.json
  vitest.config.ts
  src/app.ts                     buildApp(): Express — no listen
  src/server.ts                  listen, SIGTERM handling
  src/config/env.ts              Zod-parsed process.env, exits on invalid
  src/config/db.ts               connect/disconnect helpers
  src/lib/AppError.ts            typed operational error
  src/lib/logger.ts              pino instance
  src/lib/rateLimitStore.ts      RateLimitStore interface + InMemoryStore
  src/middleware/requestId.ts    attaches req.id
  src/middleware/error.ts        central error handler
  src/middleware/notFound.ts     terminal 404
  src/middleware/security.ts     helmet, hpp, cors, body limits
  src/middleware/rateLimit.ts    rateLimit(options) factory
  src/types/express.d.ts         Request augmentation
  src/routes/health.ts           GET /health
  tests/setup.ts                 test env vars + in-memory Mongo lifecycle
  tests/health.test.ts
  tests/errors.test.ts
  tests/rateLimit.test.ts

apps/web/                        (migrated to TS in Task 11)

CLAUDE.md  README.md  ARCHITECTURE.md  SECURITY.md  CONTRIBUTING.md
docs/adr/0001..0005-*.md
```

---

### Task 1: Monorepo restructure

Pure file movement and workspace wiring. No source edits. Doing this first means every later task works in final paths.

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`
- Move: `Backend/` → `apps/api/`, `Frontend/` → `apps/web/`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: workspace root with `apps/api`, `apps/web`, `packages/shared` resolvable by name. Package names are `@jobportal/api`, `@jobportal/web`, `@jobportal/shared`.

- [ ] **Step 1: Stop tracking `node_modules` before moving anything**

Phase 0 purges history; this stops the bleeding in the index so the move doesn't carry 3,262 files with it.

```bash
git rm -r --cached Backend/node_modules Frontend/node_modules --quiet 2>/dev/null || true
git commit -m "chore: stop tracking node_modules"
```

- [ ] **Step 2: Move the two apps**

Use `git mv` so history follows the files.

```bash
mkdir -p apps packages
git mv Backend apps/api
git mv Frontend apps/web
```

- [ ] **Step 3: Create the workspace root `package.json`**

```json
{
  "name": "job-portal",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=20.19" },
  "scripts": {
    "dev:api": "npm run dev --workspace @jobportal/api",
    "dev:web": "npm run dev --workspace @jobportal/web",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`noUncheckedIndexedAccess` will surface real bugs in the existing code (array access returning `T | undefined`). Fix them as they appear rather than disabling the flag.

- [ ] **Step 5: Rename the two workspace packages**

In `apps/api/package.json` set `"name": "@jobportal/api"`. In `apps/web/package.json` set `"name": "@jobportal/web"`.

- [ ] **Step 6: Append to `.gitignore`**

```gitignore
# Build output
dist/
*.tsbuildinfo

# Test artifacts
coverage/
```

- [ ] **Step 7: Reinstall and verify both apps still run**

```bash
rm -rf apps/api/node_modules apps/web/node_modules package-lock.json apps/*/package-lock.json
npm install
npm run dev:api    # expect "Server is running at port 8000"; Ctrl-C
npm run dev:web    # expect Vite dev server URL; Ctrl-C
```

Expected: both start with no module-resolution errors. If `apps/web` fails on the `@/` alias, confirm `apps/web/jsconfig.json` and `vite.config.js` moved intact — paths inside them are relative and should not need editing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: restructure into npm workspaces monorepo"
```

---

### Task 2: `packages/shared` scaffold

The package that makes client/server drift a compile error. Built first because `apps/api` will depend on it in Task 3.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/enums.ts`, `packages/shared/src/pagination.ts`, `packages/shared/src/index.ts`, `packages/shared/tests/enums.test.ts`, `packages/shared/vitest.config.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` from Task 1
- Produces:
  - `JOB_TYPES`, `WORK_MODES`, `APPLICATION_STATUSES`, `PORTALS` — readonly string tuples
  - `jobTypeSchema`, `workModeSchema`, `applicationStatusSchema`, `portalSchema` — `z.ZodEnum`
  - Types `JobType`, `WorkMode`, `ApplicationStatus`, `Portal`
  - `paginationQuerySchema` → `{ page: number; limit: number }`, defaults `page=1`, `limit=20`, `limit` capped at 50
  - `type PaginatedResponse<T> = { items: T[]; total: number; page: number; pages: number }`

- [ ] **Step 1: Create the package manifest**

`packages/shared/package.json`:

```json
{
  "name": "@jobportal/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "typescript": "^5.9.0", "vitest": "^3.0.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Write the failing test**

`packages/shared/tests/enums.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paginationQuerySchema, jobTypeSchema } from "../src/index.js";

describe("jobTypeSchema", () => {
  it("accepts a known job type", () => {
    expect(jobTypeSchema.parse("full-time")).toBe("full-time");
  });

  it("rejects an unknown job type", () => {
    expect(() => jobTypeSchema.parse("freelance-ish")).toThrow();
  });
});

describe("paginationQuerySchema", () => {
  it("applies defaults when absent", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it("coerces numeric strings from the query string", () => {
    expect(paginationQuerySchema.parse({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10 });
  });

  it("caps limit at 50 so a client cannot request the whole table", () => {
    expect(paginationQuerySchema.parse({ limit: "5000" })).toEqual({ page: 1, limit: 50 });
  });

  it("rejects a page below 1", () => {
    expect(() => paginationQuerySchema.parse({ page: "0" })).toThrow();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test --workspace @jobportal/shared`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 6: Write `packages/shared/src/enums.ts`**

```ts
import { z } from "zod";

export const JOB_TYPES = ["full-time", "part-time", "internship", "contract"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export const APPLICATION_STATUSES = [
  "applied", "reviewed", "shortlisted", "interview", "offered", "rejected", "withdrawn",
] as const;
export const PORTALS = ["seeker", "recruiter"] as const;

export const jobTypeSchema = z.enum(JOB_TYPES);
export const workModeSchema = z.enum(WORK_MODES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const portalSchema = z.enum(PORTALS);

export type JobType = z.infer<typeof jobTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type Portal = z.infer<typeof portalSchema>;
```

- [ ] **Step 7: Write `packages/shared/src/pagination.ts`**

`limit` clamps rather than rejects, so an over-eager client gets 50 rows instead of a 400.

```ts
import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(50).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};
```

- [ ] **Step 8: Write `packages/shared/src/index.ts`**

```ts
export * from "./enums.js";
export * from "./pagination.js";
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test --workspace @jobportal/shared`
Expected: PASS, 5 tests.

If the `limit: "5000"` case throws instead of clamping, `.catch(50)` is in the wrong position — it must come after `.max(50)` and before `.default(20)`.

- [ ] **Step 10: Build and commit**

```bash
npm run build --workspace @jobportal/shared
git add packages/shared
git commit -m "feat(shared): add enums and pagination schemas"
```

---

### Task 3: TypeScript migration of `apps/api`

Mechanical. Rename, type, make it compile — no logic changes. Behavior stays byte-identical so a reviewer can diff with confidence.

**Files:**
- Create: `apps/api/tsconfig.json`
- Modify: `apps/api/package.json`, every `.js` file under `apps/api/src`
- Move: `apps/api/*.js` → `apps/api/src/**/*.ts`

**Interfaces:**
- Consumes: `@jobportal/shared` from Task 2
- Produces: `apps/api/src/index.ts` still boots the same server on the same port with the same routes

- [ ] **Step 1: Install TypeScript toolchain**

```bash
npm install -D --workspace @jobportal/api \
  typescript@^5.9.0 tsx@^4.19.0 @types/node@^24 @types/express@^5 \
  @types/cookie-parser @types/cors @types/multer @types/jsonwebtoken
npm install --workspace @jobportal/api @jobportal/shared@*
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Move sources under `src/` and rename to `.ts`**

```bash
cd apps/api
mkdir -p src
git mv controllers middlewares models routes utils index.js src/ 2>/dev/null
cd src && for f in $(find . -name "*.js"); do git mv "$f" "${f%.js}.ts"; done
cd ../../..
```

- [ ] **Step 4: Update `apps/api/package.json` scripts**

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

`nodemon` is replaced by `tsx watch`, which runs TypeScript directly with no build step. Remove `nodemon` from dependencies — it was also incorrectly listed under `dependencies` rather than `devDependencies`.

- [ ] **Step 5: Run the typechecker to enumerate the work**

Run: `npm run typecheck --workspace @jobportal/api`
Expected: FAIL with many errors. This list *is* the task.

- [ ] **Step 6: Type the Express handlers**

Work file by file until clean. The dominant pattern — every controller needs request and response types:

```ts
import type { Request, Response } from "express";

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  // body unchanged
};
```

For Mongoose models, declare the document interface alongside the schema:

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const jobSchema = new Schema({ /* existing definition, unchanged */ }, { timestamps: true });

export type JobDocument = InferSchemaType<typeof jobSchema>;
export const Job: Model<JobDocument> = mongoose.model<JobDocument>("Job", jobSchema);
```

`InferSchemaType` derives the type from the schema you already have, so the two cannot drift.

- [ ] **Step 7: Add `.js` extensions to every relative import**

This is the NodeNext requirement from Global Constraints. Every one of these must change:

```ts
import connectDB from "./utils/db.js";        // was "./utils/db"
import userRoute from "./routes/user.route.js";
```

- [ ] **Step 8: Verify the typechecker and the build are clean**

Run: `npm run typecheck --workspace @jobportal/api && npm run build --workspace @jobportal/api`
Expected: both exit 0.

- [ ] **Step 9: Verify the server still boots against the real database**

```bash
npm run dev:api
```

Expected: `MongoDB connected: …` followed by `Server is running at port 8000`. Then `curl -i http://localhost:8000/api/v1/job/get` and confirm it returns the same 401 it did before the migration — unchanged behavior is the goal.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(api): migrate to TypeScript with no behavior change"
```

---

### Task 4: Test harness, app/server split, and `/health`

The first TDD cycle. Splitting `app` from `server` is what makes every later task testable, so it comes before any behavior work.

**Files:**
- Create: `apps/api/vitest.config.ts`, `apps/api/tests/setup.ts`, `apps/api/tests/health.test.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/config/db.ts`
- Delete: `apps/api/src/index.ts` (replaced by `app.ts` + `server.ts`), `apps/api/src/utils/db.ts` (moves to `config/db.ts`)

**Interfaces:**
- Consumes: Task 3's compiled API
- Produces:
  - `buildApp(): Express` — fully wired app, **never calls `listen`**
  - `connectDB(uri: string): Promise<void>`, `disconnectDB(): Promise<void>`
  - `GET /health` → `200 { status: "ok", uptime: number, db: "connected" | "disconnected" }`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D --workspace @jobportal/api \
  vitest@^3 supertest@^7 @types/supertest mongodb-memory-server@^10
```

- [ ] **Step 2: Create `apps/api/vitest.config.ts`**

`singleFork` keeps one in-memory MongoDB per run instead of one per worker, which is both faster and avoids port contention.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
```

- [ ] **Step 3: Create `apps/api/tests/setup.ts`**

Test env vars are set before any import reads them. Every collection is cleared between tests so no test can depend on another's leftovers.

```ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";

let mongo: MongoMemoryServer;

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_PEPPER = "test-refresh-pepper-at-least-32-chars!";
process.env.CLIENT_URLS = "http://localhost:5173";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.BREVO_API_KEY = "test";
process.env.BREVO_SENDER_EMAIL = "no-reply@example.com";
process.env.GOOGLE_CLIENT_ID = "test";
process.env.GOOGLE_CLIENT_SECRET = "test";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:8000/api/v1/seeker/auth/google/callback";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
```

- [ ] **Step 4: Write the failing test**

`apps/api/tests/health.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("reports ok with a connected database", async () => {
    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("unknown routes", () => {
  it("returns a 404 envelope rather than Express HTML", async () => {
    const res = await request(buildApp()).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test --workspace @jobportal/api`
Expected: FAIL — `Cannot find module '../src/app.js'`.

- [ ] **Step 6: Create `apps/api/src/config/db.ts`**

Replaces `utils/db.ts`, whose `process.exit(1)` made it untestable and unrecoverable.

```ts
import mongoose from "mongoose";

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
```

- [ ] **Step 7: Create `apps/api/src/routes/health.ts`**

```ts
import { Router } from "express";
import { isDBConnected } from "../config/db.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    db: isDBConnected() ? "connected" : "disconnected",
  });
});
```

- [ ] **Step 8: Create `apps/api/src/middleware/notFound.ts`**

```ts
import type { Request, Response } from "express";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "Route not found",
  });
}
```

- [ ] **Step 9: Create `apps/api/src/app.ts`**

Same middleware and routes as the old `index.ts`, minus `listen`. Body limits and hardened CORS arrive in Task 8; this step only relocates what exists.

```ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";

import applicationRoute from "./routes/application.route.js";
import companyRoute from "./routes/company.route.js";
import { healthRouter } from "./routes/health.js";
import jobRoute from "./routes/job.route.js";
import userRoute from "./routes/user.route.js";
import { notFound } from "./middleware/notFound.js";

export function buildApp(): Express {
  const app = express();

  app.use(express.json({ limit: "16mb" }));
  app.use(express.urlencoded({ extended: true, limit: "16mb" }));
  app.use(cookieParser());
  app.use(cors({
    origin: process.env.CLIENT_URLS?.split(",") ?? "http://localhost:5173",
    credentials: true,
  }));

  app.use("/health", healthRouter);
  app.use("/api/v1/user", userRoute);
  app.use("/api/v1/company", companyRoute);
  app.use("/api/v1/job", jobRoute);
  app.use("/api/v1/application", applicationRoute);

  app.use(notFound);

  return app;
}
```

- [ ] **Step 10: Create `apps/api/src/server.ts`**

The old code called `listen` and then connected to Mongo inside the callback, so the server accepted traffic before the database was reachable. This connects first.

```ts
import { buildApp } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";

const PORT = Number(process.env.PORT ?? 8000);

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");

  await connectDB(uri);

  const server = buildApp().listen(PORT, () => {
    console.log(`API listening on :${PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
```

- [ ] **Step 11: Delete the superseded files and repoint the dev script**

```bash
git rm apps/api/src/index.ts apps/api/src/utils/db.ts
```

Set `"dev": "tsx watch src/server.ts"` and `"start": "node dist/server.js"` in `apps/api/package.json`.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npm test --workspace @jobportal/api`
Expected: PASS, 2 tests.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(api): split app from server, add health check and test harness"
```

---

### Task 5: Validated environment configuration

Replaces silent `undefined` secrets with a startup failure that says exactly what is missing.

**Files:**
- Create: `apps/api/src/config/env.ts`, `apps/api/tests/env.test.ts`, `.env.example`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`

**Interfaces:**
- Consumes: Task 4's `buildApp`
- Produces: `env` — a frozen, fully-typed config object. `parseEnv(raw: NodeJS.ProcessEnv)` is exported separately so it can be tested without mutating the real environment.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const valid = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://localhost:27017/test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_PEPPER: "b".repeat(32),
  CLIENT_URLS: "http://localhost:5173,https://app.example.com",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  BREVO_API_KEY: "brevo",
  BREVO_SENDER_EMAIL: "no-reply@example.com",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
  GOOGLE_REDIRECT_URI: "http://localhost:8000/callback",
};

describe("parseEnv", () => {
  it("splits CLIENT_URLS into an array", () => {
    expect(parseEnv(valid).CLIENT_URLS).toEqual([
      "http://localhost:5173",
      "https://app.example.com",
    ]);
  });

  it("defaults PORT to 8000 as a number", () => {
    expect(parseEnv(valid).PORT).toBe(8000);
  });

  it("names the missing variable in the error", () => {
    const { MONGO_URI, ...withoutUri } = valid;
    expect(() => parseEnv(withoutUri)).toThrow(/MONGO_URI/);
  });

  it("rejects a short JWT secret", () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: "tooshort" })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rejects a malformed sender email", () => {
    expect(() => parseEnv({ ...valid, BREVO_SENDER_EMAIL: "not-an-email" })).toThrow(/BREVO_SENDER_EMAIL/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @jobportal/api -- env`
Expected: FAIL — `Cannot find module '../src/config/env.js'`.

- [ ] **Step 3: Create `apps/api/src/config/env.ts`**

The 32-character minimum on secrets is deliberate: it makes the short, guessable value from the leaked `.env` fail loudly rather than work quietly.

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),

  MONGO_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_PEPPER: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CLIENT_URLS: z
    .string()
    .transform((value) => value.split(",").map((url) => url.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("strict"),
  COOKIE_DOMAIN: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().default("Job Portal"),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export const env: Env = Object.freeze(parseEnv(process.env));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace @jobportal/api -- env`
Expected: PASS, 5 tests.

- [ ] **Step 5: Consume `env` in `app.ts` and `server.ts`**

In `app.ts` replace the raw `process.env.CLIENT_URLS?.split(",")` with `env.CLIENT_URLS`. In `server.ts` replace `process.env.PORT ?? 8000` with `env.PORT` and the `MONGO_URI` guard with `env.MONGO_URI` — the guard is now redundant because startup already failed if it was absent.

Add `import "dotenv/config";` as the **first** line of `server.ts`, before any other import, so `.env` is loaded before `env.ts` reads `process.env`.

- [ ] **Step 6: Create `.env.example` at the repository root**

```bash
# ---- Runtime ----
NODE_ENV=development
PORT=8000

# ---- Database ----
# Atlas: mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGO_URI=

# ---- Auth ----
# Generate each with: openssl rand -base64 48
# Minimum 32 characters. Never reuse the value from the pre-rotation .env.
JWT_ACCESS_SECRET=
JWT_REFRESH_PEPPER=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7

# ---- Client / cookies ----
# Comma-separated allowlist of browser origins.
CLIENT_URLS=http://localhost:5173
# "strict" when API and web share a domain; "none" when they do not (requires HTTPS).
COOKIE_SAMESITE=strict
# COOKIE_DOMAIN=.example.com

# ---- Cloudinary ----
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ---- Brevo (transactional email) ----
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Job Portal

# ---- Google OAuth ----
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/seeker/auth/google/callback
```

- [ ] **Step 7: Verify a missing variable fails startup loudly**

```bash
cd apps/api && MONGO_URI= npx tsx src/server.ts; cd ../..
```

Expected: exits non-zero printing `Invalid environment configuration:` and `MONGO_URI`. Not a stack trace about `undefined`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): validate environment configuration at startup"
```

---

### Task 6: Error handling and response envelope

Fixes the defect class that leaves clients hanging: roughly twenty `catch (error) { console.log(error) }` blocks that never send a response.

**Files:**
- Create: `apps/api/src/lib/AppError.ts`, `apps/api/src/middleware/error.ts`, `apps/api/tests/errors.test.ts`
- Modify: `apps/api/src/app.ts`, every controller under `apps/api/src/controllers/`

**Interfaces:**
- Consumes: `env` from Task 5
- Produces:
  - `class AppError extends Error` — `new AppError(statusCode, code, message, details?)`, plus static helpers `AppError.notFound(code, message)`, `AppError.forbidden(code, message)`, `AppError.badRequest(code, message, details?)`
  - `errorHandler(err, req, res, next)` — Express error middleware
  - Envelope: `{ success: false, code: string, message: string, details: unknown[], requestId?: string }`

**Note on `asyncHandler`:** the spec called for an `asyncHandler` wrapper. Express 5 forwards rejected promises from async handlers to error middleware natively, so the wrapper is dead weight here. It is deliberately omitted. This only holds because `apps/api` is on Express 5.1 — under Express 4 the wrapper would be mandatory.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/errors.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/AppError.js";
import { errorHandler } from "../src/middleware/error.js";

function appWith(handler: express.RequestHandler): express.Express {
  const app = express();
  app.get("/boom", handler);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("renders an AppError with its status and code", async () => {
    const res = await request(
      appWith(() => { throw AppError.notFound("JOB_NOT_FOUND", "Job not found"); }),
    ).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      code: "JOB_NOT_FOUND",
      message: "Job not found",
    });
  });

  it("catches a rejected async handler without the request hanging", async () => {
    const res = await request(
      appWith(async () => { throw AppError.badRequest("BAD_INPUT", "Bad input"); }),
    ).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_INPUT");
  });

  it("masks an unexpected error as a generic 500", async () => {
    const res = await request(
      appWith(() => { throw new Error("connection string leaked here"); }),
    ).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("connection string leaked here");
  });

  it("carries validation details through", async () => {
    const res = await request(
      appWith(() => {
        throw AppError.badRequest("VALIDATION_FAILED", "Validation failed", [
          { path: "email", message: "Invalid email" },
        ]);
      }),
    ).get("/boom");

    expect(res.body.details).toEqual([{ path: "email", message: "Invalid email" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @jobportal/api -- errors`
Expected: FAIL — `Cannot find module '../src/lib/AppError.js'`.

- [ ] **Step 3: Create `apps/api/src/lib/AppError.ts`**

```ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown[];

  constructor(statusCode: number, code: string, message: string, details: unknown[] = []) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, message: string, details: unknown[] = []): AppError {
    return new AppError(400, code, message, details);
  }
  static unauthorized(code: string, message: string): AppError {
    return new AppError(401, code, message);
  }
  static forbidden(code: string, message: string): AppError {
    return new AppError(403, code, message);
  }
  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }
  static tooManyRequests(code: string, message: string): AppError {
    return new AppError(429, code, message);
  }
}
```

- [ ] **Step 4: Create `apps/api/src/middleware/error.ts`**

The four-argument signature is what marks this as error middleware to Express; `_next` must stay even though it is unused.

```ts
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { id?: string }).id;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
    });
    return;
  }

  console.error("Unhandled error", { requestId, err });

  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: [],
    requestId,
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace @jobportal/api -- errors`
Expected: PASS, 4 tests.

- [ ] **Step 6: Mount the handler last in `app.ts`**

Import `errorHandler` and register it **after** `notFound`. Express matches middleware in order, and error middleware must be last or thrown errors will fall through to Express's default HTML error page.

```ts
app.use(notFound);
app.use(errorHandler);
```

- [ ] **Step 7: Replace every swallowing catch block**

In each of the four controllers, delete `catch (error) { console.log(error); }` entirely. Express 5 forwards the rejection for you. Where a controller currently returns a 4xx by hand, throw instead:

```ts
// Before
if (!job) {
  return res.status(404).json({ message: "Jobs not found.", success: false });
}

// After
if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
```

Work through `job.controller.ts`, `company.controller.ts`, `application.controller.ts`, and `user.controller.ts`. Success responses keep their current shape — changing those is Phase 1C's job.

- [ ] **Step 8: Verify nothing regressed**

Run: `npm test --workspace @jobportal/api && npm run typecheck --workspace @jobportal/api`
Expected: all pass. Then `grep -rn "console.log(error)" apps/api/src` must return nothing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): add error envelope and remove silent catch blocks"
```

---

### Task 7: Structured logging with request IDs

**Files:**
- Create: `apps/api/src/lib/logger.ts`, `apps/api/src/middleware/requestId.ts`, `apps/api/src/types/express.d.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/middleware/error.ts`

**Interfaces:**
- Consumes: `env` from Task 5, `errorHandler` from Task 6
- Produces: `logger` (Pino), `requestId` middleware setting `req.id: string`, and a global `Express.Request` augmentation adding `id`

- [ ] **Step 1: Install Pino**

```bash
npm install --workspace @jobportal/api pino@^9 pino-http@^10
npm install -D --workspace @jobportal/api pino-pretty@^13
```

- [ ] **Step 2: Create `apps/api/src/lib/logger.ts`**

`redact` is not decoration — without it, every request log line contains the auth cookie, which turns your log aggregator into a session-token store.

```ts
import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  transport: env.NODE_ENV === "development"
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
    : undefined,
});
```

- [ ] **Step 3: Create `apps/api/src/types/express.d.ts`**

```ts
import "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export {};
```

- [ ] **Step 4: Create `apps/api/src/middleware/requestId.ts`**

An inbound `x-request-id` is honoured so a trace survives across a proxy, but it is length-capped — an unbounded client-controlled value ends up in every log line.

```ts
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header("x-request-id");
  req.id = inbound && inbound.length <= 64 ? inbound : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}
```

- [ ] **Step 5: Wire both into `app.ts`**

`requestId` goes **first**, before any other middleware, so every subsequent log line and error carries it.

```ts
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/requestId.js";

// inside buildApp(), as the first two registrations:
app.use(requestId);
app.use(pinoHttp({ logger, genReqId: (req) => (req as Request).id }));
```

- [ ] **Step 6: Replace the `console.error` in `error.ts` and drop the inline cast**

```ts
import { logger } from "../lib/logger.js";
// …
logger.error({ requestId, err }, "Unhandled error");
```

Task 6 wrote `const requestId = (req as Request & { id?: string }).id;` because no augmentation existed yet. Step 3 of this task supplied it, so the cast is now redundant and misleading — narrow it to:

```ts
const requestId = req.id;
```

- [ ] **Step 7: Verify**

Run: `npm test --workspace @jobportal/api`
Expected: all pass, and output stays quiet — the logger is `silent` under `NODE_ENV=test`.

Then `npm run dev:api` and `curl -i http://localhost:8000/health`. Expected: an `x-request-id` header on the response, and a matching pretty-printed log line with no `cookie` value visible.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): add structured logging with request ids"
```

---

### Task 8: Security middleware and rate limiting

**Files:**
- Create: `apps/api/src/middleware/security.ts`, `apps/api/src/lib/rateLimitStore.ts`, `apps/api/src/middleware/rateLimit.ts`, `apps/api/tests/rateLimit.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `env` (Task 5), `AppError` (Task 6)
- Produces:
  - `applySecurity(app: Express): void` — helmet, hpp, CORS allowlist, body limits
  - `interface RateLimitStore { increment(key, windowMs): Promise<{ count: number; resetAt: number }>; reset(key): Promise<void> }`
  - `class InMemoryRateLimitStore implements RateLimitStore`
  - `rateLimit(options: { windowMs: number; max: number; keyFn?: (req) => string; code?: string }): RequestHandler`

The store interface exists so ADR-004's Redis swap is one new class and a config line, not a refactor.

- [ ] **Step 1: Install dependencies**

```bash
npm install --workspace @jobportal/api helmet@^8 hpp@^0.2.3
npm install -D --workspace @jobportal/api @types/hpp
```

- [ ] **Step 2: Write the failing test**

`apps/api/tests/rateLimit.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middleware/error.js";
import { rateLimit } from "../src/middleware/rateLimit.js";
import { InMemoryRateLimitStore } from "../src/lib/rateLimitStore.js";

function appWithLimit(max: number): express.Express {
  const app = express();
  app.get("/limited", rateLimit({ windowMs: 60_000, max, store: new InMemoryRateLimitStore() }), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("rateLimit", () => {
  it("allows requests up to the limit", async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get("/limited")).status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = appWithLimit(2);
    await request(app).get("/limited");
    await request(app).get("/limited");
    const res = await request(app).get("/limited");

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMITED");
  });

  it("sets a Retry-After header on rejection", async () => {
    const app = appWithLimit(1);
    await request(app).get("/limited");
    const res = await request(app).get("/limited");

    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("InMemoryRateLimitStore", () => {
  it("starts a fresh window after expiry", async () => {
    const store = new InMemoryRateLimitStore();
    const first = await store.increment("k", 20);
    expect(first.count).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await store.increment("k", 20);
    expect(second.count).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --workspace @jobportal/api -- rateLimit`
Expected: FAIL — `Cannot find module '../src/middleware/rateLimit.js'`.

- [ ] **Step 4: Create `apps/api/src/lib/rateLimitStore.ts`**

`unref()` on the sweep timer matters: without it the interval keeps the Node process alive and Vitest hangs after the suite finishes.

```ts
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

type Entry = { count: number; resetAt: number };

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  constructor(sweepIntervalMs = 60_000) {
    setInterval(() => this.sweep(), sweepIntervalMs).unref();
  }

  async increment(key: string, windowMs: number): Promise<Entry> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || existing.resetAt <= now) {
      const fresh: Entry = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, fresh);
      return fresh;
    }

    existing.count += 1;
    return existing;
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

export const defaultRateLimitStore = new InMemoryRateLimitStore();
```

- [ ] **Step 5: Create `apps/api/src/middleware/rateLimit.ts`**

```ts
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { defaultRateLimitStore, type RateLimitStore } from "../lib/rateLimitStore.js";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  code?: string;
  message?: string;
  store?: RateLimitStore;
};

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const {
    windowMs,
    max,
    keyFn = (req) => req.ip ?? "unknown",
    code = "RATE_LIMITED",
    message = "Too many requests. Please try again later.",
    store = defaultRateLimitStore,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `${req.method}:${req.route?.path ?? req.path}:${keyFn(req)}`;
      const { count, resetAt } = await store.increment(key, windowMs);

      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", Math.max(0, max - count));

      if (count > max) {
        res.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
        throw AppError.tooManyRequests(code, message);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test --workspace @jobportal/api -- rateLimit`
Expected: PASS, 4 tests.

- [ ] **Step 7: Create `apps/api/src/middleware/security.ts`**

CORS rejects unknown origins explicitly rather than reflecting whatever arrives. The 16 MB body limit drops to 1 MB — file uploads go through multer, not the JSON parser, so nothing legitimate needs that headroom.

```ts
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import hpp from "hpp";
import { env } from "../config/env.js";

export function applySecurity(app: Express): void {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.CLIENT_URLS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id"],
  }));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(hpp());
}
```

`trust proxy` is required for `req.ip` to hold the real client address behind Render, Railway, or any reverse proxy — without it every request appears to come from the proxy and rate limiting throttles all users as one.

- [ ] **Step 8: Replace the ad-hoc middleware in `app.ts`**

Delete the existing `express.json`, `express.urlencoded`, and `cors` calls and call `applySecurity(app)` in their place, after `requestId` and the HTTP logger. Add a global limiter before the routes:

```ts
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
```

- [ ] **Step 9: Verify**

Run: `npm test --workspace @jobportal/api && npm run typecheck --workspace @jobportal/api`
Expected: all pass.

Then with the dev server running:

```bash
curl -si http://localhost:8000/health | grep -i -E "x-powered-by|strict-transport|x-content-type"
```

Expected: no `x-powered-by`, and helmet's headers present.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): add security headers, CORS allowlist and rate limiting"
```

---

### Task 9: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: root `package.json`

**Interfaces:**
- Consumes: the `typecheck`, `test`, `build` scripts from Tasks 1–8
- Produces: a required status check on every push and pull request

- [ ] **Step 1: Add a root `ci` script**

`@jobportal/shared` must build before the API typechecks against it, so ordering is explicit rather than left to workspace iteration order.

```json
{
  "scripts": {
    "ci": "npm run build --workspace @jobportal/shared && npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run build --workspace @jobportal/shared
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  audit:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
```

`audit` is `continue-on-error` deliberately — a transitive advisory with no available fix should inform you, not block an unrelated pull request.

- [ ] **Step 3: Verify the pipeline locally before pushing**

Run: `npm run ci`
Expected: exits 0. If `lint` fails because `@jobportal/api` has no lint script, add `"lint": "eslint src --ext .ts"` there and an `eslint.config.js` mirroring the one already in `apps/web`.

- [ ] **Step 4: Commit and confirm the run is green**

```bash
git add .github package.json
git commit -m "ci: add typecheck, lint, test and build pipeline"
git push -u origin phase-1/secure-foundation
```

Then check the Actions tab and confirm `verify` passes.

---

### Task 10: Documentation set

The deliverable the user asked for by name. Written now because Tasks 1–9 settled the commands and structure these files describe.

**Files:**
- Create: `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/adr/0001-two-account-collections.md` … `0005-cookie-sessions.md`
- Delete: `apps/web/README.md` (the stock Vite template readme)

**Interfaces:**
- Consumes: scripts and structure from Tasks 1–9
- Produces: no code; every command shown must be one that actually works

- [ ] **Step 1: Write `CLAUDE.md`**

Keep it short and factual — it is read on every session, so length costs context on every future task.

````markdown
# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` (workspace root only) |
| Run API | `npm run dev:api` |
| Run web | `npm run dev:web` |
| Typecheck all | `npm run typecheck` |
| Test all | `npm test` |
| Test one file | `npm test --workspace @jobportal/api -- errors` |
| Full CI locally | `npm run ci` |

## Layout

- `apps/api` — Express 5 + Mongoose 8 API
- `apps/web` — React 19 + Vite client
- `packages/shared` — Zod schemas and types imported by both

`packages/shared` must be built before the API typechecks against it.

## Conventions

- **ESM with `moduleResolution: NodeNext`.** Every relative import needs a `.js`
  extension even in `.ts` files: `import { env } from "./config/env.js"`.
- **Module structure:** `routes → controller → service → model`. Controllers do
  HTTP only. Services hold business rules and are the only layer touching models.
  Never import another module's model directly.
- **Errors:** throw `AppError`. Never `res.status(...).json(...)` for a failure,
  and never `catch` without rethrowing — Express 5 forwards async rejections.
- **Responses:** build an explicit DTO. Never serialize a Mongoose document
  directly; that is how password hashes leak.
- **Config:** read `env` from `src/config/env.ts`. Never `process.env` directly.
- **New endpoints:** define the Zod schema in `packages/shared` first.

## Guardrails

- Never commit `.env` or any real credential. Only `.env.example` is tracked.
- Never weaken a cookie flag (`httpOnly`, `secure`, `sameSite`) to make local
  development easier — set `COOKIE_SAMESITE` instead.
- Never add a route without an ownership check if it touches a user-owned
  resource. See `ARCHITECTURE.md` for the middleware chain.
- Do not add Redis. See `docs/adr/0004-no-redis-phase-1.md` for the conditions
  under which that changes.

## Testing

Vitest + Supertest + `mongodb-memory-server`. Mount `buildApp()` directly; never
start a listener in a test. Collections are cleared between tests by
`tests/setup.ts`.

For anything touching authorization, add a case to the matrix in
`tests/authorization.test.ts`: anonymous, seeker, unrelated recruiter, owner.
````

- [ ] **Step 2: Write `README.md`**

Sections, in order: one-line description; screenshot placeholder; feature list; tech stack; quick start (prerequisites, clone, `npm install`, `cp .env.example .env`, how to obtain each credential, `npm run dev:api`, `npm run dev:web`); environment variable table copied from `.env.example` with a "how to get it" column; project layout; scripts table; deployment notes; a link to `SECURITY.md`; licence.

The credential instructions must be specific enough to follow cold: Atlas → free M0 cluster → Database Access → add user → Network Access → allowlist; Cloudinary → dashboard → Product Environment Credentials; Brevo → SMTP & API → API Keys → Create; Google → Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application → add `GOOGLE_REDIRECT_URI` as an authorised redirect URI.

- [ ] **Step 3: Write `ARCHITECTURE.md`**

Cover: the request lifecycle in order (`requestId → pino-http → applySecurity → rateLimit → routes → notFound → errorHandler`); the module boundary rule; the collection map with the relationships from the spec; the middleware chain `authenticate(portal) → requireVerified → requireOwnership` and why there is no `requireRole`; and a "Scaling triggers" section reproducing ADR-004's three Redis conditions.

- [ ] **Step 4: Write `SECURITY.md`**

Cover: how to report a vulnerability and expected response time; the threat model (what is defended, what is not); the auth design summary — Argon2id, 15-minute access token, rotating refresh token with family reuse detection, cookie flags; the rate-limit table; and a **Credential rotation runbook** reproducing the Phase 0 steps from the spec verbatim, since that is the document someone will reach for during an incident.

- [ ] **Step 5: Write `CONTRIBUTING.md`**

Cover: prerequisites; setup; branch naming (`phase-N/topic`, `feat/topic`, `fix/topic`); Conventional Commits with examples; the PR checklist (`npm run ci` green, tests added, no new `process.env` reads, no direct model serialization, docs updated); and how to run a single test.

- [ ] **Step 6: Write the five ADRs**

One file each, using the standard four headings — Status, Context, Decision, Consequences — with content taken from the spec's decision records:

| File | Decision |
|---|---|
| `docs/adr/0001-two-account-collections.md` | Separate `seekers` and `recruiters` collections |
| `docs/adr/0002-in-house-auth.md` | In-house auth over a managed provider |
| `docs/adr/0003-applications-not-embedded.md` | Applications are a collection, not an array on `jobs` |
| `docs/adr/0004-no-redis-phase-1.md` | No Redis, with the three adoption triggers |
| `docs/adr/0005-cookie-sessions.md` | Cookie sessions with CSRF over `localStorage` bearer tokens |

**`API.md` is deliberately not written here.** The spec lists it in the documentation set, but it is specified as generated from the Zod route schemas — and those schemas do not exist until Phases 1B and 1C. Writing it now would mean hand-maintaining a document that is about to be superseded. It lands in 1C, and `README.md` links to it as "coming in Phase 1C" rather than to a dead file.

- [ ] **Step 7: Verify every documented command actually runs**

Work through each command block in `README.md` and `CLAUDE.md` and execute it. A README that fails at step three is worse than none — this step is the point of the task.

- [ ] **Step 8: Commit**

```bash
git rm apps/web/README.md
git add -A
git commit -m "docs: add CLAUDE.md, README, architecture, security and ADRs"
```

---

### Task 11: TypeScript migration of `apps/web`

Mechanical, and last because nothing else depends on it. Components keep their current markup — the visual rebuild is Phase 2.

**Files:**
- Create: `apps/web/tsconfig.json`, `apps/web/src/vite-env.d.ts`, `apps/web/src/lib/apiClient.ts`
- Modify: every `.jsx`/`.js` under `apps/web/src`, `apps/web/package.json`, `apps/web/vite.config.js`
- Delete: `apps/web/jsconfig.json`, `apps/web/src/utils/constant.js`

**Interfaces:**
- Consumes: `@jobportal/shared` (Task 2)
- Produces: `apiClient` — a configured Axios instance with `withCredentials: true` and `baseURL` from `import.meta.env.VITE_API_URL`

- [ ] **Step 1: Install and configure**

```bash
npm install -D --workspace @jobportal/web typescript@^5.9 @types/react @types/react-dom
npm install --workspace @jobportal/web @jobportal/shared@*
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

Vite bundles, so `moduleResolution: "Bundler"` applies here and the `.js` extension rule from Global Constraints does **not** — that rule is specific to `apps/api` and `packages/shared`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

Add `"typecheck": "tsc -p tsconfig.json --noEmit"` to `apps/web/package.json`, then delete `jsconfig.json` — `tsconfig.json` supersedes it and two files defining the `@/*` alias will drift.

- [ ] **Step 3: Create `apps/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Replace hardcoded endpoints with a configured client**

`src/utils/constant.js` hardcodes `http://localhost:8000`, which cannot be deployed. Delete it and create `apps/web/src/lib/apiClient.ts`:

```ts
import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
```

Add `VITE_API_URL=http://localhost:8000/api/v1` to `.env.example`, and create `apps/web/.env.local` with the same line (already gitignored via `*.local`).

Then replace every `axios.get(\`${JOB_API_END_POINT}/get\`, { withCredentials: true })` with `apiClient.get("/job/get")` across the five hooks and every component that calls Axios directly. `withCredentials` is now set once on the instance rather than repeated at each call site, where it is easy to forget.

- [ ] **Step 5: Rename files**

```bash
cd apps/web/src
for f in $(find . -name "*.jsx"); do git mv "$f" "${f%.jsx}.tsx"; done
for f in $(find . -name "*.js" -not -name "*.config.js"); do git mv "$f" "${f%.js}.ts"; done
cd ../../..
```

Files containing JSX must be `.tsx`; plain modules — the Redux slices, `lib/utils` — become `.ts`.

- [ ] **Step 6: Type the components**

Run `npm run typecheck --workspace @jobportal/web` and work through the errors. Two patterns cover most of them.

Props:

```tsx
import type { JobDto } from "@jobportal/shared";

type JobProps = { job: JobDto };

const Job = ({ job }: JobProps) => { /* markup unchanged */ };
```

Typed Redux hooks — add to `src/redux/store.ts` and use them instead of the bare `useSelector`, which returns `unknown` under `strict`:

```ts
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

`JobDto` does not exist yet — it is produced by Phase 1C. Until then, declare a local `type JobDto` in `packages/shared/src/dto.ts` matching the current API response, and delete it when 1C lands.

- [ ] **Step 7: Verify typecheck, build, and the running app**

Run: `npm run typecheck --workspace @jobportal/web && npm run build --workspace @jobportal/web`
Expected: both exit 0.

Then run both dev servers and click through: home renders jobs, login works, the recruiter pages load. Behavior must be identical to before the migration.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(web): migrate to TypeScript and centralise the API client"
```

---

## Definition of done

- [ ] `npm run ci` exits 0 from a clean clone
- [ ] `git ls-files | grep node_modules` returns nothing
- [ ] `grep -rn "console.log(error)" apps/` returns nothing
- [ ] `grep -rn "localhost:8000" apps/web/src` returns nothing
- [ ] `grep -rn "process.env" apps/api/src | grep -v "config/env.ts"` returns nothing
- [ ] Every command in `README.md` and `CLAUDE.md` has been executed successfully
- [ ] `curl -si localhost:8000/health` returns 200 with an `x-request-id` header and no `x-powered-by`
- [ ] Both apps run and behave exactly as they did before Phase 1A

## What Phase 1A deliberately does not fix

Carried into 1B and 1C, listed so a reviewer does not mistake them for oversights:

- Broken access control on every route — no ownership checks yet (1C)
- `httpsOnly` typo, missing `secure` flag, client-selected role at login (1B)
- NoSQL operator injection in `User.findOne({ email })` (1B)
- `getApplicants` returning password hashes (1C)
- `$regex` search on raw user input (1C)
- Public, guessable resume URLs (1C)
- `GET /apply/:id` mutating state (1C)
- Unbounded list endpoints — `paginationQuerySchema` exists but is not yet applied (1C)
