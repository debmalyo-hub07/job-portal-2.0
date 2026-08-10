# Deploy Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the deployment path the README already documents — SPA fallback,
a Render blueprint, and a CD workflow gated on green CI — plus the not-found
route the fallback makes mandatory.

**Architecture:** Platform-native, no containers. Two static-host rewrite files
send unresolved paths to `index.html`; a committed `render.yaml` pins the API's
build, health check, instance count and 15 required variables; a reusable
`cd.yml` runs two artifact gates (boot the real `dist/server.js` against a real
mongod, inspect the real `vite build` output) and then POSTs two deploy-hook
URLs. Tests assert the config files agree with the env schema in both
directions.

**Tech Stack:** Node 24, npm workspaces, Express 5, React 19 + Vite 8 (Rolldown),
Vitest 3, GitHub Actions, Render blueprints, Vercel/Netlify/Cloudflare rewrites.

**Spec:** `docs/superpowers/specs/2026-08-10-deploy-artifacts-design.md`

## Global Constraints

- **Never commit a real credential.** Every variable in `render.yaml` is
  `sync: false` — the name is in git, the value never is. The two deploy hooks
  are GitHub repository secrets the user adds; no hook URL appears in any file.
- **Deploy hooks, never CLI tokens.** A hook is scoped to one project and one
  branch; `VERCEL_TOKEN` can act on every project in the account.
- **A missing deploy secret skips its step with an explicit log line** — never
  a failed run, never a silent success.
- **`numInstances: 1`** is load-bearing, not a cost choice: `rateLimitStore.ts`
  is a single-process `Map` per ADR-0004, so every threshold it enforces is
  per-instance. Two instances turn `LOGIN_LOCK_THRESHOLD: 5` into ~10.
- **`NODE_ENV: production` is pinned as a literal value.** `env.ts:5` defaults it
  to `development`, and `cookies.ts:18-20` keys `Secure` and the `__Host-`
  prefix off it — unset, the API serves over HTTPS setting insecure cookies with
  no error and a healthy `/health`.
- **Rewrite status is 200, not 302.** The client router reads the original path
  off `window.location`; a redirect rewrites the URL and loses the route.
- **Exactly one `<h1>` per route** (`seekerBoard.test.tsx` enforces it), and the
  navbar wordmark is a `<span>`, never a heading.
- **Frontend colour comes only from token utilities** — no hex, no Tailwind
  palette colour, no `dark:` override. `npm run lint:colour` is a hard zero.
- **Frontend spacing comes from `PageShell` density**, read as
  `p-(--space-card)` / `mt-(--space-section)`. Never hand-tuned.
- **No new runtime dependency.** The one dependency this plan adds (`yaml`) is a
  backend **devDependency**, so `audit:prod` does not see it.
- **A test that scans a file must assert it read something.** The first
  `workspaceRoutes.test.tsx` resolved to a nonexistent directory and passed over
  zero files.
- **Commit messages carry no `Co-Authored-By` trailer** — repo convention.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `frontend/vercel.json` | Vercel rewrite: every unresolved path → `/index.html` |
| `frontend/public/_redirects` | Netlify + Cloudflare Pages rewrite. In `public/` so Vite copies it into `dist` verbatim and it cannot drift from the output dir |
| `frontend/src/components/NotFound.tsx` | The catch-all page. `EmptyState` inside `PageShell`, `Navbar` above it, one `<h1>` |
| `render.yaml` | Render blueprint: build order, health check, `numInstances: 1`, `NODE_ENV`, 15 `sync: false` vars |
| `.github/workflows/cd.yml` | Reusable workflow: API smoke test, web artifact check, two hook POSTs |
| `backend/tests/deployConfig.test.ts` | Env parity in both directions; `render.yaml` parses and keeps its two pinned values |
| `frontend/tests/deployArtifacts.test.ts` | Both rewrite files exist and rewrite to `/index.html` with 200; an unmatched path renders the not-found page with one `<h1>` |
| `docs/adr/0007-deploy-topology.md` | Records single-instance as a consequence of ADR-0004 |

**Modified:**

| File | Change |
|---|---|
| `frontend/src/routes/appRoutes.tsx` | Import `NotFound`; add `{ path: "*", element: <NotFound /> }` **last** in `children` |
| `.github/workflows/ci.yml` | Add a `deploy` job: `needs: [verify, audit]`, `uses: ./.github/workflows/cd.yml`, guarded to push-on-main |
| `backend/package.json` | Add `yaml` to `devDependencies` |
| `README.md` | Deployment section: fallback requirement, blueprint, auto-deploy-off step, two secrets |
| `CLAUDE.md` | The `/_design` claim becomes a claim with a check behind it |

**Why the not-found route is in this phase and not later:** `appRoutes` enumerates
30 literal paths with no `*` entry, and `RootLayout` renders only
`<PortalScope><Outlet /></PortalScope>`. Today `/typo` gets the host's 404 page.
With the rewrite and nothing else, the host returns 200 and `index.html`, the
router matches nothing, and the visitor gets a blank white page — strictly worse
than what it replaces. The fallback is what causes it, so the route ships with it.

---

### Task 1: The not-found route

Ships first. The rewrite in Task 2 is what turns an unmatched path into a blank
page, so the route that catches it must already exist.

**Files:**
- Create: `frontend/src/components/NotFound.tsx`
- Create: `frontend/tests/deployArtifacts.test.tsx`
- Modify: `frontend/src/routes/appRoutes.tsx` (import + one route entry, last)

**Interfaces:**
- Consumes: `Navbar` (default export, `@/components/shared/Navbar`), `PageShell`
  (default), `PageHeader`, `EmptyState`, `Button` (`asChild`, variants `signal` /
  `outline`), `renderAppAt` from `tests/helpers/renderRoute`
- Produces: `NotFound` as the **default** export of
  `@/components/NotFound`; a route `{ path: "*" }` in `appRoutes[0].children`

Extension note: the file is `.tsx`, not the `.ts` the spec named — it renders
components, and a `.ts` file cannot hold JSX.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/deployArtifacts.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { appRoutes } from "@/routes/appRoutes";
import { renderAppAt } from "./helpers/renderRoute";

/**
 * The SPA fallback (see the rewrite files asserted below) makes this route
 * mandatory rather than nice to have. The host answers an unresolved path with
 * 200 and index.html, so the router receives a path it has no entry for — and
 * before this route existed it matched nothing and rendered nothing. A blank
 * white page is strictly worse than the host 404 it replaced.
 */
describe("the not-found route", () => {
  it("mounts a catch-all in the route table", () => {
    const paths = appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path));
    expect(paths).toContain("*");
  });

  // Under every prefix: `*` is the last-ranked match everywhere, and each of
  // these resolves a different portal signal through PortalScope.
  it.each(["/no-such-page", "/hire/no-such-page", "/admin/no-such-page"])(
    "renders the not-found page at %s",
    async (entry) => {
      renderAppAt(entry);
      expect(
        await screen.findByRole("heading", { level: 1, name: /page not found/i }),
      ).toBeInTheDocument();
    },
  );

  it("has exactly one h1 at an unmatched path", async () => {
    // Same rule seekerBoard.test.tsx enforces per route. A path that matches
    // nothing is still a route, and it still gets exactly one page title.
    renderAppAt("/no-such-page");
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1));
  });

  it("offers a way back to the board", async () => {
    renderAppAt("/no-such-page");
    expect(await screen.findByRole("link", { name: /browse open roles/i })).toHaveAttribute(
      "href",
      "/jobs",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test --workspace @jobportal/web -- deployArtifacts
```

Expected: FAIL. The table assertion fails on `expect(paths).toContain("*")`; the
three render assertions time out in `findByRole` because nothing renders.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/NotFound.tsx`:

```tsx
import { Compass } from "lucide-react";
import { Link } from "react-router";

import Navbar from "./shared/Navbar";
import { EmptyState } from "./layout/EmptyState";
import { PageHeader } from "./layout/PageHeader";
import PageShell from "./layout/PageShell";
import { Button } from "./ui/button";

/**
 * The catch-all page, mounted at `*`.
 *
 * It exists because of the SPA fallback rather than in spite of it: the host
 * rewrites every unresolved path to index.html with a 200, so a mistyped URL
 * reaches the client instead of the host's own 404 page. With no route to catch
 * it the router matches nothing and renders nothing — a blank white page.
 *
 * No portal prop, deliberately. `*` matches under every prefix and PortalScope
 * already resolves the signal colour from the path, so /hire/typo renders in
 * recruiter signal without this page knowing which portal it sits on.
 */
const NotFound = () => (
  <>
    {/* Outside PageShell like every other seeker page: the navbar is full-bleed
        and the shell's inner container would clamp it to the content column. */}
    <Navbar />
    <PageShell width="narrow">
      <PageHeader
        title="Page not found"
        description="That URL does not match any page here. The link may be incomplete, or the page may have been renamed."
      />
      <EmptyState
        icon={Compass}
        title="Pick up from somewhere real"
        description="Every open role lives on the job board, and each search there is a link you can share."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="signal">
              <Link to="/jobs">Browse open roles</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        }
      />
    </PageShell>
  </>
);

export default NotFound;
```

- [ ] **Step 4: Mount it last in the route table**

In `frontend/src/routes/appRoutes.tsx`, add the import beside the other
top-level component imports (after the `Profile` import on line 6):

```tsx
import NotFound from "@/components/NotFound";
```

Then add the route as the **final** entry of `children`, after the `/_design`
spread:

```tsx
      // DEV-only. `import.meta.env.DEV` is statically false in a production
      // build, so Rollup drops both this route and the dynamic import.
      ...(import.meta.env.DEV && DesignGallery
        ? [
            {
              path: "/_design",
              element: (
                <Suspense fallback={null}>
                  <DesignGallery />
                </Suspense>
              ),
            },
          ]
        : []),
      // Last, and it must stay last to read correctly — though react-router
      // ranks by specificity rather than declaration order, so `*` loses to
      // every literal path above regardless of where it sits.
      //
      // Mandatory since the SPA rewrite: the host answers an unresolved path
      // with 200 and index.html, so a mistyped URL arrives here instead of at
      // the host's 404 page. Without this entry the router matches nothing and
      // the visitor gets a blank page. See vercel.json and public/_redirects.
      { path: "*", element: <NotFound /> },
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm test --workspace @jobportal/web -- deployArtifacts
```

Expected: PASS, 6 tests (1 table + 3 parameterised renders + 1 h1 + 1 link).

- [ ] **Step 6: Confirm nothing else regressed**

```bash
npm test --workspace @jobportal/web
npm run lint:colour --workspace @jobportal/web
```

Expected: the full web suite passes and the colour gate reports zero violations.
`seekerBoard.test.tsx`'s one-`h1` assertions matter most here — the new page adds
a `PageHeader`, and a second `<h1>` anywhere would trip them.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/NotFound.tsx frontend/src/routes/appRoutes.tsx frontend/tests/deployArtifacts.test.tsx
git commit -m "feat(web): add the not-found route the SPA fallback requires"
```

---

### Task 2: SPA fallback for three hosts

**Files:**
- Create: `frontend/vercel.json`
- Create: `frontend/public/_redirects`
- Modify: `frontend/tests/deployArtifacts.test.tsx` (add a describe block)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; the test file it appends to was
  created there
- Produces: two host-config files read only by the tests and by the hosts

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/deployArtifacts.test.tsx`, and add these two imports at
the top of the file beside the existing ones:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

Then the block. `process.cwd()` rather than `import.meta.url`: under the vite
transform that URL is not drive-qualified on Windows, which is how the first
`workspaceRoutes.test.tsx` scan resolved to `D:\src` and read nothing.

```tsx
/**
 * The client routes on the client. A static host knows nothing about the route
 * table, so it must serve index.html for any path it cannot resolve to a file —
 * otherwise every deep link, refresh and bookmark 404s and only `/` works.
 *
 * Measured before this shipped, against a fresh dist served naively: `/` → 200,
 * and /jobs, /hire/login, /admin/review/jobs, /profile and /browse all → 404.
 */
describe("SPA fallback config", () => {
  const FRONTEND = process.cwd();

  it("vercel.json rewrites every unresolved path to index.html", () => {
    const raw = readFileSync(join(FRONTEND, "vercel.json"), "utf8");
    // Malformed JSON is a deploy-time failure otherwise, and Vercel reports it
    // as a build error with no hint that the rewrite is the cause.
    const config = JSON.parse(raw) as { rewrites?: { source: string; destination: string }[] };
    expect(config.rewrites).toBeDefined();
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("public/_redirects serves Netlify and Cloudflare with a 200, not a redirect", () => {
    // In public/ so Vite copies it into dist verbatim — no build step, and it
    // cannot drift from the output directory.
    const rule = readFileSync(join(FRONTEND, "public", "_redirects"), "utf8");
    const active = rule
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    expect(active).toContain("/* /index.html 200");
    // 200 is load-bearing. A 302 rewrites the address bar, and the client
    // router reads the original path off window.location — so a redirect
    // discards the route it was meant to preserve.
    expect(active.some((l) => /\b30[128]\b/.test(l))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test --workspace @jobportal/web -- deployArtifacts
```

Expected: FAIL, both new tests, with `ENOENT: no such file or directory` naming
`vercel.json` and `public/_redirects`.

- [ ] **Step 3: Write `frontend/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

- [ ] **Step 4: Write `frontend/public/_redirects`**

Netlify and Cloudflare Pages both read this filename with this syntax, so one
file serves both. No JSON — the format is `from to status`, one rule per line.

```
# SPA fallback for Netlify and Cloudflare Pages. Vercel reads vercel.json
# instead; both ship because the README names all three hosts and a reader
# following it should not have to know which dialect their host speaks.
#
# 200, not 302: this is a rewrite. The client router reads the original path off
# window.location, so a redirect would rewrite the URL and lose the route.
#
# This file lives in public/ so Vite copies it into dist verbatim.
/*    /index.html   200
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm test --workspace @jobportal/web -- deployArtifacts
```

Expected: PASS, 8 tests.

Note on whitespace: the assertion compares against the single-spaced string
`"/* /index.html 200"`, and the file above is column-aligned. Normalise runs of
whitespace in the test rather than un-aligning the file — change the `active`
mapping to `.map((l) => l.trim().replace(/\s+/g, " "))`. Make that edit now if
the assertion fails on spacing.

- [ ] **Step 6: Verify the rewrite file reaches the build output**

The whole point of `public/` is that Vite copies it. Prove it rather than
assuming:

```bash
rm -rf frontend/dist
npm run build --workspace @jobportal/web
cat frontend/dist/_redirects
```

Expected: the file's contents print. If `dist/_redirects` is missing, the file is
in the wrong directory and Netlify would silently 404 every deep link.

- [ ] **Step 7: Commit**

```bash
git add frontend/vercel.json frontend/public/_redirects frontend/tests/deployArtifacts.test.tsx
git commit -m "feat(web): serve index.html for unresolved paths on all three hosts"
```

### Task 3: The Render blueprint and env parity

The load-bearing test in the whole phase. A new required variable should fail a
test, not a production boot.

**Files:**
- Create: `render.yaml` (repository root — Render reads it from there)
- Create: `backend/tests/deployConfig.test.ts`
- Modify: `backend/src/config/env.ts` (export `envSchema`)
- Modify: `backend/package.json` (`yaml` devDependency — **already installed**,
  verify rather than re-run)

**Interfaces:**
- Consumes: `envSchema` from `../src/config/env.js`, `parse` from `yaml`
- Produces: `render.yaml` with one service whose `envVars` names every required
  variable; `envSchema` as a named export of `src/config/env.ts`

Two deviations from the spec, both deliberate:
1. The spec said "parse the required variables out of `env.ts`". A text scan of a
   Zod schema is fragile. Exporting the schema and asking it
   (`shape[key].safeParse(undefined)`) is exact, and it stays correct when the
   schema is reformatted. Verified: this yields exactly the 15 required keys.
2. The blueprint pins `COOKIE_SAMESITE=none`, which the spec did not mention.
   Render and Vercel are different *sites*, so a `strict` cookie is never sent
   on the request after login — the README already documents this as a sign-in
   that succeeds followed by an anonymous next request with nothing logged.
   Leaving it to the dashboard means the default silently breaks the deployment.

- [ ] **Step 1: Confirm the `yaml` devDependency is present**

```bash
grep -n '"yaml"' backend/package.json
node -e "import('yaml').then(m => console.log('parse:', typeof m.parse))"
```

Expected: the grep prints a `devDependencies` line, and the node call prints
`parse: function`. Install with `npm install yaml --save-dev --workspace
@jobportal/api` only if the grep finds nothing. It is a devDependency
deliberately: `audit:prod` scans production dependencies, so a test-only parser
does not widen that surface.

- [ ] **Step 2: Export the schema from `env.ts`**

`envSchema` is currently module-private. Change its declaration on line 4 of
`backend/src/config/env.ts` from `const envSchema = z.object({` to:

```ts
/**
 * Exported for `tests/deployConfig.test.ts`, which checks the deploy blueprint
 * and .env.example against it in both directions. Asking the schema which
 * variables are required beats scanning this file's text: a reformat cannot
 * break it, and adding a variable cannot silently escape the check.
 *
 * `parseEnv` remains the only validated way in — it adds the cross-field rule
 * that the four secrets must all differ, which the schema alone does not know.
 */
export const envSchema = z.object({
```

- [ ] **Step 3: Write the failing test**

Create `backend/tests/deployConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

import { envSchema } from "../src/config/env.js";

const BACKEND = resolve(__dirname, "..");
const REPO = resolve(__dirname, "../..");

/**
 * Requiredness asked of the schema rather than read off the source text: a
 * variable is required exactly when its own parser rejects `undefined`, which
 * covers plain strings, `.default(...)`, `.optional()` and the
 * `.transform().pipe()` shape CLIENT_URLS uses without special-casing any.
 */
const shape = envSchema.shape as unknown as Record<
  string,
  { safeParse: (value: unknown) => { success: boolean } }
>;
const ALL_KEYS = Object.keys(shape);
const REQUIRED_KEYS = ALL_KEYS.filter((key) => !shape[key]!.safeParse(undefined).success);

type EnvVar = { key: string; value?: string; sync?: boolean };
type Blueprint = {
  services?: {
    name?: string;
    healthCheckPath?: string;
    numInstances?: number;
    autoDeploy?: boolean;
    startCommand?: string;
    buildCommand?: string;
    envVars?: EnvVar[];
  }[];
};

// A malformed blueprint is otherwise a deploy-time failure, reported by Render
// as a build error that never mentions YAML.
const blueprint = parse(readFileSync(resolve(REPO, "render.yaml"), "utf8")) as Blueprint;
const service = blueprint.services?.[0];
const declared = new Map((service?.envVars ?? []).map((v) => [v.key, v]));

/** Keys named in .env.example, whether commented out (optional) or not. */
const EXAMPLE_KEYS = new Set(
  readFileSync(resolve(BACKEND, ".env.example"), "utf8")
    .split(/\r?\n/)
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
    .filter((key): key is string => Boolean(key)),
);

describe("deploy config", () => {
  /**
   * A scan that resolves to nothing passes every assertion below it. The first
   * workspaceRoutes.test.tsx did exactly that — it read zero files and reported
   * green.
   */
  it("actually read a schema, a blueprint and an env template", () => {
    expect(REQUIRED_KEYS.length).toBeGreaterThan(10);
    expect(declared.size).toBeGreaterThan(10);
    expect(EXAMPLE_KEYS.size).toBeGreaterThan(10);
  });

  it.each(REQUIRED_KEYS)("%s is documented in .env.example", (key) => {
    expect(EXAMPLE_KEYS.has(key)).toBe(true);
  });

  it.each(REQUIRED_KEYS)("%s is declared in render.yaml", (key) => {
    // Without this, a variable added to the schema deploys as a boot crash on
    // Render rather than a red test here.
    expect(declared.has(key)).toBe(true);
  });

  it("declares no variable the schema does not know", () => {
    // The other direction: a variable deleted from the schema must not linger
    // in the blueprint, where it reads as still-required forever.
    expect([...declared.keys()].filter((key) => !ALL_KEYS.includes(key))).toEqual([]);
  });

  it("names .env.example no variable the schema does not know", () => {
    expect([...EXAMPLE_KEYS].filter((key) => !ALL_KEYS.includes(key))).toEqual([]);
  });

  it("carries no secret value — every unpinned variable is sync: false", () => {
    // The blueprint is tracked in git. Only the two topology constants below
    // may carry a literal.
    const pinned = new Set(["NODE_ENV", "COOKIE_SAMESITE"]);
    for (const [key, entry] of declared) {
      if (pinned.has(key)) continue;
      expect({ key, value: entry.value, sync: entry.sync }).toEqual({
        key,
        value: undefined,
        sync: false,
      });
    }
  });

  it("pins NODE_ENV to production", () => {
    // env.ts defaults it to "development" and cookies.ts keys both the Secure
    // attribute and the __Host- prefix off it, so an API deployed without this
    // serves over HTTPS setting insecure cookies, with a healthy /health and no
    // error anywhere.
    expect(declared.get("NODE_ENV")).toEqual({ key: "NODE_ENV", value: "production" });
  });

  it("pins COOKIE_SAMESITE to none for a cross-site deployment", () => {
    // Render and Vercel are different registrable domains. Under `strict` the
    // cookie is never sent on the request after login: sign-in succeeds, the
    // next request is anonymous, and nothing is logged.
    expect(declared.get("COOKIE_SAMESITE")).toEqual({ key: "COOKIE_SAMESITE", value: "none" });
  });

  it("runs a single instance", () => {
    // rateLimitStore.ts is a single-process Map (ADR-0004), so every threshold
    // it enforces is per-instance: two instances turn LOGIN_LOCK_THRESHOLD 5
    // into ~10. Scaling this is a security change, not a capacity one.
    expect(service?.numInstances).toBe(1);
  });

  it("health-checks the endpoint that reports database connectivity", () => {
    expect(service?.healthCheckPath).toBe("/health");
  });

  it("leaves deployment to CI rather than to a push", () => {
    // Render's default deploys on every push, which would start a deploy while
    // the suite is still running — so the revision users get is the one the
    // host chose, not the one the workflow approved.
    expect(service?.autoDeploy).toBe(false);
  });

  it("builds shared before the API, from the repository root", () => {
    // npm resolves the workspace symlink only from the root, and the API
    // compiles against shared's emitted .d.ts.
    const build = service?.buildCommand ?? "";
    expect(build).toContain("@jobportal/shared");
    expect(build.indexOf("@jobportal/shared")).toBeLessThan(build.indexOf("@jobportal/api"));
  });

  it("starts node directly so SIGTERM reaches the shutdown handler", () => {
    // Through `npm start` the signal lands on npm, which need not forward it —
    // and server.ts's SIGTERM handler is what closes the listener, stops the
    // sweeper and disconnects Mongo. Render sends SIGTERM on every redeploy.
    expect(service?.startCommand).toBe("node backend/dist/server.js");
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
npm test --workspace @jobportal/api -- deployConfig
```

Expected: FAIL at import — `ENOENT ... render.yaml`. The whole file fails to
collect, because the blueprint is read at module scope.

- [ ] **Step 5: Write `render.yaml` at the repository root**

```yaml
# Render blueprint for the API.
#
# Committed rather than left as dashboard state: every field below is a decision
# worth reviewing, and two of them (numInstances, NODE_ENV) are security
# parameters that look like ordinary settings in a web form.
#
# Render reads this file from the repository root. The web app is not described
# here — it deploys to Vercel from frontend/, see frontend/vercel.json.
services:
  - type: web
    name: jobportal-api
    runtime: node
    plan: free
    # Keep this near the Atlas region. Every request pays the API-to-database
    # round trip, and that latency dominates anything the app itself does.
    region: singapore

    # Build from the repository root, not from backend/. npm resolves the
    # @jobportal/shared workspace symlink only from here, and shared must be
    # built before the API compiles against its emitted .d.ts — the same
    # ordering the root `ci` script encodes.
    rootDir: .
    buildCommand: npm ci && npm run build --workspace @jobportal/shared && npm run build --workspace @jobportal/api

    # node directly, not `npm start`. Render sends SIGTERM on every redeploy,
    # and server.ts handles it to close the listener, stop the sweeper and
    # disconnect Mongo. Through npm the signal lands on npm, which need not
    # forward it — so graceful shutdown would silently never run.
    startCommand: node backend/dist/server.js

    # /health already reports database connectivity, so a revision that boots
    # without a reachable Mongo fails the check instead of serving 500s.
    healthCheckPath: /health

    # NOT a cost decision. rateLimitStore.ts is a single-process Map
    # (docs/adr/0004-no-redis-phase-1.md), so every threshold it enforces is
    # per-instance. Two instances turn LOGIN_LOCK_THRESHOLD 5 into ~10 and
    # OTP_BUDGET_MAX_FAILURES 20 into ~40 — brute-force resistance divided by
    # the instance count. Raising this is a security change that needs the
    # shared store ADR-0004 defers. See docs/adr/0007-deploy-topology.md.
    numInstances: 1

    # CI is the gate. Render's default is to deploy on every push, which starts
    # a deploy while the suite is still running — so the revision that reaches
    # users is the one the host chose, not the one the workflow approved.
    # .github/workflows/cd.yml POSTs the deploy hook after both CI jobs pass.
    autoDeploy: false

    envVars:
      # Pinned as a literal. env.ts defaults NODE_ENV to "development", and
      # cookies.ts keys both the Secure attribute and the __Host- prefix off it.
      # An API deployed without this boots normally, serves over Render's HTTPS,
      # reports /health ok — and sets every session cookie without Secure and
      # without __Host-. No error, no warning.
      - key: NODE_ENV
        value: production

      # api.onrender.com and the web app on Vercel are different *sites*, not
      # merely different origins, and SameSite compares sites. Under `strict`
      # the session cookie is never sent on the request after login: sign-in
      # succeeds, the next request is anonymous, and nothing is logged anywhere.
      # Change to `strict` only if both apps move under one registrable domain.
      - key: COOKIE_SAMESITE
        value: none

      # Names in git, values never. `sync: false` also makes a fresh deploy stop
      # and ask rather than start with a blank value — matching how env() already
      # behaves, refusing to boot and naming every variable it is missing.
      - key: MONGO_URI
        sync: false
      # Four independent secrets. The API refuses to boot if any two are equal.
      - key: JWT_ACCESS_SECRET
        sync: false
      - key: JWT_REFRESH_PEPPER
        sync: false
      - key: OTP_PEPPER
        sync: false
      - key: CSRF_SECRET
        sync: false
      # Both Google redirect URIs are derived from API_BASE_URL, and Google
      # matches redirect_uri byte-for-byte — so this must be the public Render
      # URL, with both derived URIs registered on the OAuth client.
      - key: API_BASE_URL
        sync: false
      - key: WEB_BASE_URL
        sync: false
      - key: CLIENT_URLS
        sync: false
      - key: CLOUDINARY_CLOUD_NAME
        sync: false
      - key: CLOUDINARY_API_KEY
        sync: false
      - key: CLOUDINARY_API_SECRET
        sync: false
      - key: BREVO_API_KEY
        sync: false
      - key: BREVO_SENDER_EMAIL
        sync: false
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm test --workspace @jobportal/api -- deployConfig
```

Expected: PASS, 41 tests — 1 non-vacuity guard, 15 `.env.example` checks, 15
`render.yaml` checks, and 10 single assertions.

- [ ] **Step 7: Prove the parity test actually bites**

Both directions, since a parity test that cannot fail is the exact trap this
phase is guarding against. Temporarily break each and confirm the failure names
the variable:

```bash
# Forward: a required variable missing from the blueprint
node -e "const f='render.yaml',s=require('fs');s.writeFileSync(f+'.bak',s.readFileSync(f));s.writeFileSync(f,s.readFileSync(f,'utf8').replace(/      - key: OTP_PEPPER\n        sync: false\n/,''))"
npm test --workspace @jobportal/api -- deployConfig
```

Expected: exactly one failure, named `OTP_PEPPER is declared in render.yaml`.

```bash
# Reverse: a blueprint variable the schema does not know
node -e "const f='render.yaml',s=require('fs');s.writeFileSync(f,s.readFileSync(f,'utf8')+'      - key: OTP_PEPPPER\n        sync: false\n')"
npm test --workspace @jobportal/api -- deployConfig
```

Expected: `declares no variable the schema does not know` fails, listing
`OTP_PEPPPER` — the typo that would otherwise sit in the blueprint forever while
the real variable went undeclared.

```bash
# The template: a required variable no longer documented for a human deployer
mv render.yaml.bak render.yaml
node -e "const f='backend/.env.example',s=require('fs');s.writeFileSync(f+'.bak',s.readFileSync(f));s.writeFileSync(f,s.readFileSync(f,'utf8').replace(/^CSRF_SECRET=$/m,'# CSRF_SECRET='))"
npm test --workspace @jobportal/api -- deployConfig
```

Expected: exactly one failure, `CSRF_SECRET is documented in .env.example` —
commenting a required variable out is the realistic version of this mistake, and
it must be caught, because a commented line reads as "optional, has a default".

Restore and confirm green:

```bash
mv backend/.env.example.bak backend/.env.example
npm test --workspace @jobportal/api -- deployConfig
git status --short
```

Expected: PASS, 41 tests, and a clean `git status` for both edited files. The
root `.gitignore` already covers `*.bak`, so a leftover backup will not be
committed — but it will sit next to the file it shadows and the next reader will
not know which one is live. Delete them.

- [ ] **Step 8: Confirm the schema export broke nothing**

```bash
npm run build --workspace @jobportal/shared
npm run typecheck
npm test --workspace @jobportal/api
```

Expected: typecheck clean, and the API suite passes with 41 more tests than
before (294 → 335). `env.test.ts` matters most — it imports from the same module.

- [ ] **Step 9: Commit**

```bash
git add render.yaml backend/tests/deployConfig.test.ts backend/src/config/env.ts backend/package.json package-lock.json
git commit -m "feat(deploy): commit the Render blueprint, with env parity under test"
```

### Task 4: The CD workflow

Two artifact gates and two hook POSTs. This is the only check in the repository
that proves the shipped artifacts run — `npm test` mounts `buildApp()` from
source and never executes `dist/server.js`.

**Files:**
- Create: `.github/workflows/cd.yml`
- Modify: `.github/workflows/ci.yml` (one `deploy` job)

**Interfaces:**
- Consumes: the `render.yaml` `startCommand` target (`backend/dist/server.js`)
  from Task 3; the `dist/_redirects` copy proven in Task 2
- Produces: a reusable workflow at `./.github/workflows/cd.yml` taking no inputs
  and reading two optional secrets, `RENDER_DEPLOY_HOOK_URL` and
  `VERCEL_DEPLOY_HOOK_URL`

Secrets note: a reusable workflow does not inherit the caller's secrets unless the
caller passes them. `secrets: inherit` on the calling job is what makes them
visible — without it both steps would always skip, and the skip is quiet by
design, so the failure would look like success.

- [ ] **Step 1: Write `.github/workflows/cd.yml`**

```yaml
name: CD

# Reusable, called by ci.yml with `needs: [verify, audit]`. That edge is the
# gate: deployment cannot begin until both existing jobs pass. Triggering on
# `workflow_run` instead would express the same intent with a weaker guarantee
# and an extra indirection.
on:
  workflow_call:

jobs:
  # The only check in this repository that runs the built artifacts. `npm test`
  # mounts buildApp() from source through vitest and never executes
  # dist/server.js — the same class of gap that produced a blank page from an
  # import-time throw while the suite stayed green, since jsdom resolves through
  # Node and the browser through Rolldown.
  artifacts:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      # A real mongod rather than mongodb-memory-server: the deployed API talks
      # to a server over a connection string, and that is the thing worth
      # rehearsing here.
      mongo:
        image: mongo:7
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --quiet --eval 'db.runCommand({ ping: 1 })'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      # shared first: the API compiles against its emitted .d.ts.
      - run: npm run build --workspace @jobportal/shared
      - run: npm run build --workspace @jobportal/api

      - name: Boot the built API and check /health
        env:
          NODE_ENV: production
          PORT: 8000
          MONGO_URI: mongodb://127.0.0.1:27017/jobportal_smoke
          API_BASE_URL: http://127.0.0.1:8000
          WEB_BASE_URL: http://127.0.0.1:5173
          CLIENT_URLS: http://127.0.0.1:5173
          # Placeholders. Nothing here reaches Cloudinary, Brevo or Google — the
          # check boots the app and asks /health. env() refuses to start without
          # them, which is the behaviour being rehearsed.
          CLOUDINARY_CLOUD_NAME: smoke
          CLOUDINARY_API_KEY: smoke
          CLOUDINARY_API_SECRET: smoke
          BREVO_API_KEY: smoke
          BREVO_SENDER_EMAIL: smoke@example.com
          GOOGLE_CLIENT_ID: smoke
          GOOGLE_CLIENT_SECRET: smoke
        run: |
          set -euo pipefail

          # Four distinct throwaway secrets, generated here and never persisted.
          # parseEnv refuses to boot if any two are equal, so they must differ.
          export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
          export JWT_REFRESH_PEPPER="$(openssl rand -base64 48)"
          export OTP_PEPPER="$(openssl rand -base64 48)"
          export CSRF_SECRET="$(openssl rand -base64 48)"

          # The exact command render.yaml runs. Not `npm start`, which would
          # exercise a different process tree than the deployment does.
          node backend/dist/server.js > /tmp/api.log 2>&1 &
          API_PID=$!

          # Poll rather than sleep: the boot cost is a Mongo connection, which is
          # fast on a warm service container and occasionally is not. A fixed
          # sleep is either wasted time or a flake.
          for i in $(seq 1 30); do
            if curl -fsS http://127.0.0.1:8000/health > /tmp/health.json 2>/dev/null; then
              break
            fi
            # A boot failure is not something to wait 30 seconds for. server.ts
            # logs the reason and exits non-zero, so surface it immediately.
            if ! kill -0 "$API_PID" 2>/dev/null; then
              echo "::error::the built API exited during boot"
              cat /tmp/api.log
              exit 1
            fi
            sleep 1
          done

          echo "--- /health ---"
          cat /tmp/health.json || true
          echo

          # Both fields. `status: ok` alone would pass with a disconnected
          # database, which is most of what this check is for.
          #
          # --input-type=commonjs is not decoration: the root package.json sets
          # "type": "module", and leaving the eval input type to Node's syntax
          # detection is how a `require` in a one-liner becomes a confusing
          # ReferenceError in CI and nowhere else.
          node --input-type=commonjs -e '
            const h = JSON.parse(require("node:fs").readFileSync("/tmp/health.json", "utf8"));
            if (h.status !== "ok") throw new Error("status=" + h.status);
            if (h.db !== "connected") throw new Error("db=" + h.db);
            console.log("health ok, db connected");
          '

          echo "--- boot log ---"
          cat /tmp/api.log

          # SIGTERM, the signal Render sends, so the shutdown path runs here too.
          kill -TERM "$API_PID"
          wait "$API_PID" 2>/dev/null || true

      - name: Build the web app and inspect the artifact
        env:
          VITE_API_URL: http://127.0.0.1:8000/api/v1
        run: |
          set -euo pipefail
          rm -rf frontend/dist
          npm run build --workspace @jobportal/web

          test -f frontend/dist/index.html || { echo "::error::no index.html"; exit 1; }

          # A hashed asset reference. An index.html that survived a build with no
          # bundle wired into it renders a blank page and passes a file check.
          grep -qE 'src="/assets/index-[A-Za-z0-9_-]+\.js"' frontend/dist/index.html \
            || { echo "::error::index.html references no hashed bundle"; cat frontend/dist/index.html; exit 1; }

          # The SPA fallback rule must reach the output directory. It lives in
          # public/ so Vite copies it, and this is what proves the copy happened
          # — a missing _redirects 404s every deep link on Netlify and
          # Cloudflare with nothing to indicate why.
          grep -q '/index.html' frontend/dist/_redirects \
            || { echo "::error::_redirects missing from the build output"; exit 1; }

          # CLAUDE.md claims the production build does not contain /_design.
          # Nothing verified that until now: it holds by construction, because
          # import.meta.env.DEV is statically false and Rollup drops the branch.
          # This is what would catch a regression.
          if grep -rIl '_design' frontend/dist; then
            echo "::error::the DEV-only design gallery is in the production bundle"
            exit 1
          fi

          echo "web artifact ok"

  deploy:
    needs: artifacts
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      # Deploy hooks, not CLI tokens. A hook is scoped to one project and one
      # branch; a VERCEL_TOKEN can act on every project in the account, so a
      # leaked token is an account compromise rather than one unwanted deploy.
      #
      # A missing secret skips its step with an explicit log line rather than
      # failing the run or quietly succeeding. Red CI for a deploy nobody
      # configured trains people to ignore CI; a silent skip leaves "I pushed,
      # why is it not live?" unanswerable. The log line is the difference.
      - name: Trigger the API deploy
        env:
          HOOK: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
        run: |
          set -euo pipefail
          if [ -z "${HOOK}" ]; then
            echo "::notice::RENDER_DEPLOY_HOOK_URL is not set — skipping the API deploy."
            echo "Add it under Settings → Secrets and variables → Actions."
            echo "Render → service → Settings → Deploy Hook."
            exit 0
          fi
          # -f so a 4xx from the hook fails the step. --output so the response
          # body cannot echo anything derived from the URL into the log.
          curl -fsS -X POST "${HOOK}" --output /dev/null
          echo "API deploy triggered."

      - name: Trigger the web deploy
        env:
          HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
        run: |
          set -euo pipefail
          if [ -z "${HOOK}" ]; then
            echo "::notice::VERCEL_DEPLOY_HOOK_URL is not set — skipping the web deploy."
            echo "Add it under Settings → Secrets and variables → Actions."
            echo "Vercel → project → Settings → Git → Deploy Hooks."
            exit 0
          fi
          curl -fsS -X POST "${HOOK}" --output /dev/null
          echo "Web deploy triggered."

      # A hook answers 202 as soon as the deploy is queued, so the run above
      # reports "triggered" and never "live". Verifying the deployed revision
      # needs a polled health check against the public URL, which needs a stable
      # public URL to exist first.
      - name: Note what a triggered deploy does and does not prove
        run: |
          echo "Deploys are queued, not verified. A hook returns 202 once the"
          echo "host accepts the request; it does not report the build result."
          echo "Check the Render and Vercel dashboards for the outcome."
```

- [ ] **Step 2: Wire it into `ci.yml`**

Append to `.github/workflows/ci.yml`, after the `audit` job:

```yaml
  # Deployment is gated on both jobs above. `needs` is the whole mechanism: it
  # is what makes a green suite the precondition for a deploy rather than a
  # coincidence that happens to finish first.
  #
  # Pull requests build and test but never deploy. `secrets: inherit` is
  # required — a reusable workflow sees none of the caller's secrets otherwise,
  # and both deploy steps skip quietly by design, so the omission would look
  # exactly like success.
  deploy:
    needs: [verify, audit]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    uses: ./.github/workflows/cd.yml
    secrets: inherit
```

- [ ] **Step 3: Check both workflows parse**

Actions reports a malformed workflow as a run that never starts, which is easy
to miss. Parse them locally with the `yaml` package Task 3 installed:

```bash
node --input-type=module -e '
  import { parse } from "yaml";
  import { readFileSync } from "node:fs";
  for (const f of [".github/workflows/ci.yml", ".github/workflows/cd.yml"]) {
    const doc = parse(readFileSync(f, "utf8"));
    console.log(f, "→ jobs:", Object.keys(doc.jobs).join(", "));
  }
'
```

Expected:
```
.github/workflows/ci.yml → jobs: verify, audit, deploy
.github/workflows/cd.yml → jobs: artifacts, deploy
```

If `yaml` is not resolvable from the repository root, run the snippet from
`backend/` with the paths prefixed `../`.

- [ ] **Step 4: Check the shell steps are syntactically valid**

`bash -n` parses without executing, so an unbalanced quote or `fi` is caught here
rather than on a push:

```bash
node --input-type=module -e '
  import { parse } from "yaml";
  import { readFileSync, writeFileSync } from "node:fs";
  const doc = parse(readFileSync(".github/workflows/cd.yml", "utf8"));
  let n = 0;
  for (const job of Object.values(doc.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.run) writeFileSync(`/tmp/step-${n++}.sh`, step.run);
    }
  }
  console.log("wrote", n, "step scripts");
'
for f in /tmp/step-*.sh; do bash -n "$f" && echo "ok $f"; done
rm -f /tmp/step-*.sh
```

Expected: every step reports `ok`. A syntax error prints the line and fails.

- [ ] **Step 5: Confirm no secret value is in either file**

```bash
grep -nE 'RENDER_DEPLOY_HOOK_URL|VERCEL_DEPLOY_HOOK_URL' .github/workflows/cd.yml
```

Expected: matches only as `${{ secrets.… }}` references and in the two
human-readable skip messages. No URL, no token, no literal value anywhere.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/cd.yml .github/workflows/ci.yml
git commit -m "ci: run the built artifacts and deploy on green main"
```

Note that this workflow only truly runs on a push to `main`. The `artifacts` job
runs on the first such push and is where a mistake will surface; watch that run
rather than assuming it passed.

---

### Task 5: Documentation

The last task, deliberately: everything it describes exists by now, so nothing
here is written from intention.

**Files:**
- Create: `docs/adr/0007-deploy-topology.md`
- Modify: `README.md` (the Deployment section, lines 319–342)
- Modify: `CLAUDE.md` (the `/_design` claim, Current state → What 2A closed)

**Interfaces:**
- Consumes: every file created in Tasks 1–4
- Produces: no code

- [ ] **Step 1: Write `docs/adr/0007-deploy-topology.md`**

Follow the existing ADR format — read `docs/adr/0004-no-redis-phase-1.md` first
and match its heading structure (`# ADR-NNNN: Title`, `**Status:**`, `##
Context`, `## Decision`, `## Consequences`).

```markdown
# ADR-0007: Deploy topology — platform-native, single instance

**Status:** Accepted (2026-08-10). Implemented in the deploy artifacts phase.

## Context

The README documented a deployment from Phase 1A onward and nothing implemented
it: no host configuration, no continuous delivery, and no SPA fallback — so
every route except `/` returned 404 on a static host. Measured against a fresh
build: `/jobs`, `/hire/login`, `/admin/review/jobs`, `/profile` and `/browse`
all 404, while `/` served. In-app navigation worked because that is
`history.pushState` and never reaches the host; refreshes, pasted links and
bookmarks did not — which is most of the traffic a job board receives.

Two shipped features were inert because of it. Phase 2B-2 existed to make a
filtered board a URL worth sharing, and every such link 404'd for the recipient.
The pre-3A workspace redirects are client routes, so a recruiter's old bookmark
never reached the redirect that existed to honour it.

## Decision

**Platform-native, not containers.** Render builds the API from source and
Vercel builds the web app. Nothing in this repository consumes an image, and a
second build path that no deploy exercises drifts out of correctness unnoticed.

**One instance, and that is a security parameter.** `rateLimitStore.ts` is a
single-process `Map` per [ADR-0004](0004-no-redis-phase-1.md). Every threshold
it enforces is therefore per-instance, and scaling out does not fail — it
multiplies:

| Control | Configured | Effective at 2 instances |
|---|---|---|
| `LOGIN_LOCK_THRESHOLD` | 5 | ~10 |
| `OTP_BUDGET_MAX_FAILURES` | 20 | ~40 |
| `OTP_MAX_ATTEMPTS` | 5 | ~10 |

Nothing surfaces this at the point of change. The dashboard control is a number
field beside the plan selector, and someone scaling up to handle traffic has no
reason to connect it to brute-force resistance. `numInstances: 1` is therefore
in committed configuration with the reason attached, not in a dashboard.

**`NODE_ENV` and `COOKIE_SAMESITE` are pinned literals in the blueprint.**
`env.ts` defaults `NODE_ENV` to `development` and `cookies.ts` keys both the
`Secure` attribute and the `__Host-` prefix off it, so an API deployed without
it serves over HTTPS setting insecure cookies — no error, no warning, `/health`
still `ok`. The guardrail against weakening a cookie flag held in the code and
was silently void in deployment, and the variable that voided it is the one a
host does not require you to set. `COOKIE_SAMESITE=none` is pinned for the
related reason: Render and Vercel are different registrable domains, so under
`strict` the session cookie is never sent after login.

**Deploy hooks, not CLI tokens.** A hook is scoped to one project and one
branch. A `VERCEL_TOKEN` can act on every project in the account, so a leaked
token is an account compromise rather than one unwanted deploy.

## Consequences

- Horizontal scaling now has a documented prerequisite. Someone who wants a
  second instance finds this file and ADR-0004's three conditions, rather than
  discovering the coupling by weakening a lockout without noticing.
- A rewrite-all rule masks genuine 404s: any unmatched path returns the app
  shell with 200, so a mistyped asset URL renders the SPA rather than failing
  visibly. This is inherent to client-side routing on a static host, and it is
  why the not-found route shipped in the same phase — without it the rewrite
  turns a host 404 into a blank page.
- The deploy is triggered, not verified. A hook answers 202 once the deploy is
  queued and reports nothing about the build. Verifying the deployed revision
  needs a polled health check against a public URL, which needs a stable public
  URL to exist first.
- Auto-deploy must be turned off in both dashboards. Left on, the host starts
  deploying on push while CI is still running, and the revision users get is the
  one the host chose rather than the one the workflow approved. `autoDeploy:
  false` covers Render; Vercel's is a dashboard setting this repository cannot
  set.
```

- [ ] **Step 2: Rewrite the README Deployment section**

Replace lines 319–342 of `README.md` — from `## Deployment` down to and
including `Set VITE_API_URL on the web host…` — with the text below. Leave the
`### Cookies and where you host the two apps` subsection that follows it in
place; it is still correct and the new text points at it.

````markdown
## Deployment

Both apps deploy independently from this monorepo. Build commands run from the
repository root so npm can resolve the workspace symlink, and
`@jobportal/shared` must be built before either app.

**API — Render.** [`render.yaml`](render.yaml) is a blueprint: point Render at
this repository and it reads the build command, start command, health check,
instance count and the full list of required variables from that file. Every
value is `sync: false`, so Render prompts for each one and the repository never
carries a secret. Two variables are pinned as literals and should not be
overridden — see [ADR-0007](docs/adr/0007-deploy-topology.md) for why
`NODE_ENV=production` and `numInstances: 1` are not cosmetic.

**Web — Vercel.** Root directory `frontend`, output `dist`, and one variable:

```
Build:  npm ci && npm run build -w @jobportal/shared && npm run build -w @jobportal/web
Output: dist
Env:    VITE_API_URL=https://<your-api-host>/api/v1
```

### The SPA fallback is not optional

The client routes on the client, so a static host must serve `index.html` for
any path it cannot resolve to a file. Without that rule only `/` works: every
deep link, refresh and bookmark 404s, and in-app navigation still works — which
makes it easy to miss until someone shares a link.

Both files ship, so any of the three named hosts works out of the box:

| Host | File | Rule |
|---|---|---|
| Vercel | `frontend/vercel.json` | `/(.*)` → `/index.html` |
| Netlify, Cloudflare Pages | `frontend/public/_redirects` | `/* /index.html 200` |

The status is **200, not 302**. The router reads the original path off
`window.location`, so a redirect rewrites the URL and loses the route.

### Continuous delivery

`.github/workflows/cd.yml` runs after both CI jobs pass on `main`. It builds
both apps, boots the real `backend/dist/server.js` against a `mongo:7` service
container and asserts `/health` reports `status: ok` and `db: connected`, then
inspects the web bundle. Only then does it trigger the two deploys.

Two setup steps this repository cannot do for you:

1. **Turn off auto-deploy in both dashboards.** Render and Vercel both deploy on
   every push by default, which starts a deploy while CI is still running — so
   the revision users get is the one the host chose, not the one the workflow
   approved. `render.yaml` sets `autoDeploy: false`; Vercel's is a project
   setting (Settings → Git → Ignored Build Step, or disconnect the Git
   integration and deploy by hook only).
2. **Add two repository secrets** under Settings → Secrets and variables →
   Actions:

| Secret | Where to get it |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → service → Settings → Deploy Hook |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel → project → Settings → Git → Deploy Hooks |

Hook URLs rather than API tokens on purpose: a hook can deploy one project from
one branch, while a `VERCEL_TOKEN` can act on every project in the account.

A missing secret **skips that deploy with a note in the run log** rather than
failing the build — a red check for a deploy nobody configured teaches everyone
to ignore red checks. The deploy is triggered, not verified: a hook returns 202
once the deploy is queued and says nothing about whether it succeeded.
````

- [ ] **Step 3: Update the `/_design` claim in CLAUDE.md**

In the "What 2A closed" list, the last bullet currently reads:

```markdown
- `/_design` renders every primitive across both themes × both portals. It is
  DEV-only via `import.meta.env.DEV` + `React.lazy`, so Rollup drops it from
  production; the build is verified to not contain it
```

Replace the trailing clause so the claim names its check:

```markdown
- `/_design` renders every primitive across both themes × both portals. It is
  DEV-only via `import.meta.env.DEV` + `React.lazy`, so Rollup drops it from
  production. That was true by construction and unchecked until the deploy
  phase; `.github/workflows/cd.yml` now greps the built bundle for it and fails
  the run if it reappears
```

- [ ] **Step 4: Read both edits back and check every claim**

```bash
sed -n '319,400p' README.md
grep -n "_design" CLAUDE.md
```

Confirm against the files as they now exist: the two secret names match
`cd.yml`, the two rewrite paths and rules match Tasks 1–2, and `render.yaml`
really does set `autoDeploy: false`. Docs drifting behind code is a recorded
pattern in this repository — grep before trusting any claim, including one you
just wrote.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0007-deploy-topology.md README.md CLAUDE.md
git commit -m "docs: record the deploy topology and its two dashboard prerequisites"
```

---

### Task 6: Full verification

Nothing new is written here. This is the gate before the phase is called done.

**Files:** none created or modified, unless something below fails.

- [ ] **Step 1: Run the full CI locally**

Takes over 120 seconds — run it in the background and read the output when it
lands.

```bash
npm run ci
```

Expected: build, typecheck, lint, colour gate, both suites and both builds all
pass. Lint runs before tests, so a single lint error exits before a test runs and
hides a fully green suite — read the failure line rather than assuming which
stage failed.

- [ ] **Step 2: Confirm the test counts moved**

```bash
npm test --workspace @jobportal/api 2>&1 | tail -5
npm test --workspace @jobportal/web 2>&1 | tail -5
```

Expected: API 294 → 335 (41 added in Task 3); web up by 8 (6 in Task 1, 2 in
Task 2). A count that did not move means a new file was not collected.

- [ ] **Step 3: Confirm no secret and no stray artifact is staged**

```bash
git status --short
git diff --cached --stat
grep -rnE 'hooks\.(render|vercel)|srv_|prj_' render.yaml .github/workflows/cd.yml || echo "no hook literals"
```

Expected: `render.yaml.bak` is gone (Task 3 step 7), no `.env` is tracked, and
the grep prints `no hook literals`.

- [ ] **Step 4: Prove the deep-link gap is actually closed**

The measurement that opened this phase, repeated against the shipped config. A
naive static server is what a host does *before* a rewrite rule, so serve `dist`
with the `_redirects` rule applied by hand and confirm the routes that 404'd now
resolve:

```bash
rm -rf frontend/dist
npm run build --workspace @jobportal/web
node --input-type=module -e '
  import { createServer } from "node:http";
  import { readFileSync, existsSync } from "node:fs";
  import { join } from "node:path";
  const DIST = "frontend/dist";
  createServer((req, res) => {
    const p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
    const file = existsSync(p) && !p.endsWith("dist") ? p : join(DIST, "index.html");
    res.writeHead(200).end(readFileSync(file));
  }).listen(4173, () => console.log("listening"));
' &
sleep 2
for path in / /jobs "/jobs?keyword=react" /hire/login /admin/review/jobs /profile /browse /no-such-page; do
  printf "%-28s %s\n" "$path" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4173$path")"
done
kill %1
```

Expected: **200 for all eight**, where seven of them were 404 before this phase.
`/no-such-page` returning 200 is correct and is exactly why Task 1 exists — the
router now has a route to render for it.

- [ ] **Step 5: Push**

```bash
git log --oneline -6
git push origin main
```

Expected: five commits from this phase land on `main`. The `deploy` job runs for
the first time on this push — watch it. Both deploy steps will skip with a
notice until the two secrets are added, which is the designed behaviour, not a
failure.

---

## Notes for the implementer

**Order matters between Tasks 1 and 2.** The not-found route ships before the
rewrite. Reversed, there is a window in which an unmatched path renders a blank
page — and if the phase stopped halfway, that window would be what shipped.

**Do not add Redis** to solve the single-instance constraint. ADR-0004 records
three conditions under which that changes; none has been met.

**Do not weaken a cookie flag** to make anything here work. `COOKIE_SAMESITE` is
the supported lever and the blueprint already sets it.

**If a test fails, find the root cause before changing the assertion.** The env
parity test exists precisely because it should fail when the config and the
schema disagree — its failing is it working.

