# Phase 2B-1 — Design Language and Portal-Split Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the compositional design language 2A deferred, split authentication by portal so the portal is a route literal, add the missing `/hire` employer front door, and fix three confirmed bugs — all under a frontend test runner that does not exist yet.

**Architecture:** Four density-aware layout primitives (`PageShell`, `PageHeader`, `EmptyState`, `FormField`) plus two auth primitives (`AuthLayout`, `PortalPanel`) become the only way these pages express structure. Auth page components stop owning their portal: the router injects it as a prop, mirroring how the backend mounts one `buildAuthRouter(portal)` twice. Density is a `data-density` attribute resolving CSS custom properties, exactly as `data-portal` already resolves signal colour — so components read tokens and branch on nothing.

**Tech Stack:** React 19, Vite 7, Tailwind 4 (`@tailwindcss/vite`), CVA, Radix (`radix-ui` umbrella), framer-motion 12, next-themes, react-router-dom 7, Redux Toolkit + redux-persist. New: Vitest 3, React Testing Library, jsdom, `typescript-eslint`, Playwright (already installed as a devDependency, uncommitted).

## Global Constraints

- **Frontend-only.** No file under `backend/` or `packages/shared/` is modified. Verified: the Google callback redirects to portal-neutral `/auth/*` paths carrying `?portal=`, so keeping those pages shared requires no backend change.
- **ESM with `Bundler` resolution in `frontend`** — relative imports take **no** `.js` extension. (`backend` and `packages/shared` are `NodeNext` and do; do not copy their style.)
- **`Portal` is `"seeker" | "recruiter"`, always a route literal.** `PortalScope` reads `useLocation().pathname` only — never a body, query, or cookie. A component that takes a portal from user input is a bug.
- **No colour outside the token system.** No hex literal, no Tailwind palette colour, no `dark:` colour override — the tokens flip themselves. Exit grep (must return nothing), widened in Task 1 to catch side-specific borders:
  `grep -rE '(bg|text|border)-\[#|(bg|text|border)(-[trbl])?-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan|gray|slate|zinc|neutral|stone)-[0-9]' frontend/src`
- **Filled elements carrying text use `--signal-text` fill + `--signal-fg` text.** Base `--signal` is non-text use only (borders, rings, indicators). The `signal` button variant already implements this (`components/ui/button.tsx:13`).
- **Semantic state is icon *and* label, never colour alone.**
- **Fraunces (`font-display`) never below 20px** (`text-xl` = 1.44rem = 23px is the smallest permitted). Geist Sans for anything smaller.
- **Geist Mono only for aligned numeric comparison** — table columns of figures — never a lone value in a badge.
- **Motion:** one easing `--ease-out-quint`, durations 120/200/380ms. Every consumer goes through a `lib/motion.tsx` composable, which short-circuits under `prefers-reduced-motion: reduce`. Never call `framer-motion` directly in a page.
- **Density values are normative** (Task 1's table). Never hand-tune spacing on a page; pass `density`.
- Commit after each task. Conventional-commit messages. **No `Co-Authored-By` trailer** — repo convention.
- Run `npm run typecheck` and `npm run lint` from the repo root before each commit.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `frontend/vitest.config.ts` | test runner config, jsdom env, `@` alias |
| `frontend/tests/setup.ts` | RTL cleanup, `matchMedia` stub |
| `frontend/tests/helpers/renderRoute.tsx` | render a component at a route inside the real providers |
| `frontend/src/components/layout/PageShell.tsx` | container width, page padding, density root |
| `frontend/src/components/layout/PageHeader.tsx` | h1 + description + action slot |
| `frontend/src/components/layout/EmptyState.tsx` | icon + heading + body + CTA |
| `frontend/src/components/layout/FormField.tsx` | label + control + hint + error |
| `frontend/src/components/auth/AuthLayout.tsx` | split-screen auth shell |
| `frontend/src/components/auth/PortalPanel.tsx` | portal-specific panel — **one** component, props only |
| `frontend/src/components/auth/authCopy.ts` | per-portal strings and endpoints, keyed by `Portal` |
| `frontend/src/routes/authRoutes.tsx` | builds the auth route set for a given portal + prefix |
| `frontend/src/pages/HireLanding.tsx` | `/hire` employer front door |
| `frontend/src/hooks/usePublicJobCount.ts` | open-role count for the seeker panel, with fallback |

**Modified:**

| Path | Change |
|---|---|
| `frontend/eslint.config.js` | add a `**/*.{ts,tsx}` block — `.tsx` is currently unlinted |
| `frontend/src/index.css` | density tokens |
| `frontend/src/components/theme/PortalScope.tsx` | route map: `/hire` and `/admin` → recruiter |
| `frontend/src/App.tsx` | mount seeker + recruiter auth route sets, add `/hire` |
| `frontend/src/components/auth/Login.tsx` | `portal` prop, radio deleted, `AuthLayout` |
| `frontend/src/components/auth/Signup.tsx` | same |
| `frontend/src/components/auth/VerifyEmail.tsx` · `ForgotPassword.tsx` · `ResetPassword.tsx` · `AuthComplete.tsx` · `LinkPending.tsx` · `ConfirmGoogleLink.tsx` · `AuthError.tsx` | `AuthLayout` |
| `frontend/src/components/shared/Navbar.tsx` | `AvatarFallback`, portal-aware links |
| `frontend/src/components/Home.tsx` · `HeroSection.tsx` · `LatestJobs.tsx` · `Footer.tsx` | left axis, `EmptyState`, real copy |
| `frontend/package.json` | test scripts, devDependencies |

**Deleted:** none.

---

### Task 1: Lint coverage, density tokens, widened exit grep

Foundation. Everything later depends on lint actually running and `density` resolving.

**Files:**
- Modify: `frontend/eslint.config.js`
- Modify: `frontend/src/index.css:75` (after the `@theme inline` block)
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: CSS vars `--space-section`, `--space-card`, `--space-row`, `--space-field`, `--space-page-top`, resolved from `[data-density="spacious"|"compact"]`. Tailwind utilities are **not** generated for these — consumers read them via arbitrary values (`p-(--space-card)`).

- [ ] **Step 1: Prove `.tsx` is currently unlinted**

```bash
cd frontend
printf 'const unused = 42;\nexport default function P() { return null; }\n' > src/__lintprobe.tsx
npx eslint src/__lintprobe.tsx
```

Expected: `File ignored because no matching configuration was supplied`, exit 0. This is the bug.

- [ ] **Step 2: Add a TypeScript block to `frontend/eslint.config.js`**

Replace the file with:

```js
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // The base rule misfires on TS type-only constructs; the TS variant
      // replaces it. Uppercase-initial names are components and const enums.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
    },
  },
])
```

- [ ] **Step 3: Verify the probe now fails**

```bash
cd frontend && npx eslint src/__lintprobe.tsx; echo "exit=$?"
```

Expected: an `@typescript-eslint/no-unused-vars` error for `unused`, exit 1.

- [ ] **Step 4: Remove the probe, then lint the real tree**

```bash
cd frontend && rm -f src/__lintprobe.tsx && npx eslint . 2>&1 | tail -40
```

Record every violation. Fix only those in files this plan already modifies (see File Structure). For any violation in a file this plan does **not** touch, add it to a `docs/superpowers/plans/2026-08-05-phase-2b-lint-debt.md` list rather than disabling the rule. Do not add blanket `eslint-disable` comments.

- [ ] **Step 5: Add density tokens to `frontend/src/index.css`**

Insert immediately after the closing `}` of `@theme inline` (line 75) and before `:root {`:

```css
/* Density — a parameter, not a per-component judgement. Spacious is the
   marketing and seeker default; compact is the recruiter workspace. Set via
   data-density on PageShell; components read the vars, never the attribute. */
:root,
[data-density="spacious"] {
  --space-section: 6rem;   /* 96px */
  --space-card: 1.5rem;    /* 24px */
  --space-row: 3.5rem;     /* 56px */
  --space-field: 1.25rem;  /* 20px */
  --space-page-top: 4rem;  /* 64px */
}
[data-density="compact"] {
  --space-section: 2rem;   /* 32px */
  --space-card: 1rem;      /* 16px */
  --space-row: 2.5rem;     /* 40px */
  --space-field: 0.75rem;  /* 12px */
  --space-page-top: 2rem;  /* 32px */
}
```

- [ ] **Step 6: Widen the colour exit grep and record it**

Add to `frontend/package.json` `scripts`:

```json
"lint:colour": "bash -c \"! grep -rEn '(bg|text|border)-\\\\[#|(bg|text|border)(-[trbl])?-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan|gray|slate|zinc|neutral|stone)-[0-9]' src\""
```

- [ ] **Step 7: Run it — expect failures, and that is the point**

```bash
cd frontend && npm run lint:colour
```

Expected: FAIL, listing the inherited neutrals (`Footer.tsx:5` `border-t-gray-200`, `Job.tsx:26` `bg-white border-gray-100`, `Login.tsx:74` `border-gray-200`, and others). The widened pattern catches `border-t-gray-200`, which the 2A pattern missed. These are fixed as their files are rebuilt in later tasks; the script is expected to fail until Task 9.

- [ ] **Step 8: Commit**

```bash
git add frontend/eslint.config.js frontend/src/index.css frontend/package.json
git commit -m "chore(web): lint .tsx files, add density tokens, widen colour grep

eslint.config.js matched **/*.{js,jsx} only, so every .tsx resolved to \"no
matching configuration\" and npm run lint passed vacuously. typescript-eslint
was already a devDependency and unwired.

The colour grep missed side-specific borders (border-t-gray-200 in Footer),
so it is widened to (bg|text|border)(-[trbl])? and to the full neutral scale."
```

---

### Task 2: Test runner

**Files:**
- Create: `frontend/vitest.config.ts`, `frontend/tests/setup.ts`, `frontend/tests/helpers/renderRoute.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `renderRoute(ui, { route, path })` — renders `ui` inside `MemoryRouter` at `route`, wrapped in the real Redux `Provider` and `ThemeProvider`, returning RTL's result. Every later task's tests use it.

- [ ] **Step 1: Install**

```bash
npm install --workspace @jobportal/web --save-dev vitest@^3 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitest/coverage-v8
```

Playwright is already present as a devDependency from the design investigation; keep it.

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Playwright specs drive a real browser and must not run under jsdom.
    exclude: ["node_modules/**", "dist/**", "tests/visual/**"],
  },
});
```

- [ ] **Step 3: Create `frontend/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// next-themes and framer-motion's useReducedMotion both read matchMedia, which
// jsdom does not implement. Default to "no preference" so motion composables
// take their animated branch; a test that wants reduced motion overrides this.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
```

- [ ] **Step 4: Create `frontend/tests/helpers/renderRoute.tsx`**

```tsx
import type { ReactElement, ReactNode } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";

import authReducer from "@/redux/authSlice";
import jobReducer from "@/redux/jobSlice";
import companyReducer from "@/redux/companySlice";
import applicationReducer from "@/redux/applicationSlice";
import { PortalScope } from "@/components/theme/PortalScope";

/**
 * A fresh store per render.
 *
 * Deliberately NOT the app's store from `@/redux/store`: that one is wrapped in
 * redux-persist and rehydrates from localStorage, so a test that dispatched a
 * signed-in user would leak it into every subsequent test in the run and the
 * failures would depend on file order. Same reducers, no persistence.
 */
export function makeStore(preloadedState?: Record<string, unknown>) {
  return configureStore({
    reducer: {
      auth: authReducer,
      job: jobReducer,
      company: companyReducer,
      application: applicationReducer,
    },
    ...(preloadedState ? { preloadedState } : {}),
  });
}

/**
 * Renders `ui` at `route` inside the providers the app actually mounts.
 *
 * PortalScope is included deliberately: most assertions in this suite are about
 * what the portal resolves to for a given URL, and that is exactly what it
 * computes. `path` defaults to `route` so a caller testing a static URL need
 * not repeat it; pass it explicitly for parameterised routes.
 */
export function renderRoute(
  ui: ReactElement,
  {
    route,
    path,
    store = makeStore(),
  }: { route: string; path?: string; store?: ReturnType<typeof makeStore> },
) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <PortalScope>
          <Routes>
            <Route path={path ?? route} element={ui} />
          </Routes>
        </PortalScope>
      </MemoryRouter>
    </Provider>,
  );
}

/** Reads the resolved portal from the nearest PortalScope wrapper. */
export function portalOf(container: HTMLElement): string | null {
  return container.querySelector("[data-portal]")?.getAttribute("data-portal") ?? null;
}

export function Probe({ children }: { children?: ReactNode }) {
  return <div data-testid="probe">{children}</div>;
}
```

- [ ] **Step 5: Add scripts to `frontend/package.json`**

```json
"test": "vitest run",
"test:watch": "vitest",
"test:visual": "node tests/visual/run.mjs"
```

- [ ] **Step 6: Write a smoke test at `frontend/tests/setup.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { Probe, portalOf, renderRoute } from "./helpers/renderRoute";

describe("test harness", () => {
  it("renders inside the app providers", () => {
    const { getByTestId } = renderRoute(<Probe>hello</Probe>, { route: "/" });
    expect(getByTestId("probe")).toHaveTextContent("hello");
  });

  it("exposes the resolved portal", () => {
    const { container } = renderRoute(<Probe />, { route: "/" });
    expect(portalOf(container)).toBe("seeker");
  });
});
```

- [ ] **Step 7: Run**

```bash
npm run test --workspace @jobportal/web
```

Expected: 2 passing.

- [ ] **Step 8: Confirm the root `ci` script picks it up**

```bash
npm run test
```

Expected: backend suite and the new frontend suite both run. The root `test` script is `npm run test --workspaces --if-present`; the frontend previously had no `test` script, so it was skipped.

- [ ] **Step 9: Commit**

```bash
git add frontend/vitest.config.ts frontend/tests frontend/package.json package-lock.json
git commit -m "test(web): add Vitest + Testing Library harness

The frontend had no test runner; 2A was verified by typecheck, lint, build and
a colour grep. This slice adds routing, redirect and session behaviour, where
those prove close to nothing.

renderRoute mounts the real Provider/PortalScope so portal-resolution
assertions exercise the component that actually computes it."
```

---

### Task 3: PortalScope route map

The first behavioural change, and the one every later route decision rests on.

**Files:**
- Modify: `frontend/src/components/theme/PortalScope.tsx`
- Test: `frontend/tests/portalScope.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `portalForPath(pathname: string): Portal` — exported so tests and `authRoutes` share one definition of the mapping.

- [ ] **Step 1: Write the failing test at `frontend/tests/portalScope.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { portalForPath } from "@/components/theme/PortalScope";
import { Probe, portalOf, renderRoute } from "./helpers/renderRoute";

describe("portalForPath", () => {
  it.each([
    ["/", "seeker"],
    ["/login", "seeker"],
    ["/signup", "seeker"],
    ["/jobs", "seeker"],
    ["/profile", "seeker"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it.each([
    ["/hire", "recruiter"],
    ["/hire/login", "recruiter"],
    ["/hire/signup", "recruiter"],
    ["/admin/companies", "recruiter"],
    ["/admin/jobs/create", "recruiter"],
  ])("%s -> %s", (path, expected) => {
    expect(portalForPath(path)).toBe(expected);
  });

  it("does not treat a path merely prefixed by 'hire' as recruiter", () => {
    // "/hired" must not match "/hire". Prefix checks that forget the boundary
    // are how a seeker page silently renders the recruiter signal.
    expect(portalForPath("/hired")).toBe("seeker");
    expect(portalForPath("/hiring-guide")).toBe("seeker");
    expect(portalForPath("/administrator")).toBe("seeker");
  });

  it("ignores a ?portal= query param", () => {
    // The invariant: portal is a route literal. A query param must never move it.
    const { container } = renderRoute(<Probe />, { route: "/login?portal=recruiter" });
    expect(portalOf(container)).toBe("seeker");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- portalScope
```

Expected: FAIL — `portalForPath` is not exported.

- [ ] **Step 3: Rewrite `frontend/src/components/theme/PortalScope.tsx`**

```tsx
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { Portal } from "@jobportal/shared";

/** Route prefixes that resolve to the recruiter portal. */
const RECRUITER_PREFIXES = ["/hire", "/admin"] as const;

/**
 * The portal a pathname belongs to.
 *
 * Exported so the router and the tests share one definition — two copies of
 * this mapping would drift, and the drift is invisible until a page renders
 * the wrong signal colour against the right endpoint.
 *
 * Matches on a segment boundary, not a bare prefix: "/hired" and
 * "/administrator" are seeker paths, and `startsWith("/hire")` would claim both.
 */
export function portalForPath(pathname: string): Portal {
  return RECRUITER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "recruiter"
    : "seeker";
}

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state, a body, a query or a cookie. The signal tokens
 * re-resolve off this attribute; no component branches on the portal to pick a
 * colour.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div data-portal={portalForPath(pathname)}>{children}</div>;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- portalScope
```

Expected: PASS, 4 test blocks.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/components/theme/PortalScope.tsx frontend/tests/portalScope.test.tsx
git commit -m "feat(web): PortalScope maps /hire and /admin to the recruiter portal

Matches on a segment boundary rather than a bare prefix, so /hired and
/administrator stay seeker paths. portalForPath is exported so the router and
the tests share one definition instead of drifting copies."
```

---

### Task 4: Layout primitives

**Files:**
- Create: `frontend/src/components/layout/PageShell.tsx`, `PageHeader.tsx`, `EmptyState.tsx`, `FormField.tsx`
- Test: `frontend/tests/layout.test.tsx`

**Interfaces:**
- Consumes: density CSS vars from Task 1.
- Produces:
  - `<PageShell density?: "spacious" | "compact"; width?: "narrow" | "default" | "wide"; children>` — default `density="spacious"`, `width="default"`.
  - `<PageHeader title: string; description?: string; actions?: ReactNode>`
  - `<EmptyState icon: LucideIcon; title: string; description?: string; action?: ReactNode>`
  - `<FormField label: string; htmlFor: string; hint?: string; error?: string; required?: boolean; children>`

- [ ] **Step 1: Write the failing test at `frontend/tests/layout.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { FormField } from "@/components/layout/FormField";

describe("PageShell", () => {
  it("defaults to spacious density", () => {
    const { container } = render(<PageShell>x</PageShell>);
    expect(container.querySelector("[data-density]")).toHaveAttribute(
      "data-density",
      "spacious",
    );
  });

  it("accepts compact density", () => {
    const { container } = render(<PageShell density="compact">x</PageShell>);
    expect(container.querySelector("[data-density]")).toHaveAttribute(
      "data-density",
      "compact",
    );
  });
});

describe("PageHeader", () => {
  it("renders the title as the page h1", () => {
    const { getByRole } = render(<PageHeader title="Companies" />);
    expect(getByRole("heading", { level: 1 })).toHaveTextContent("Companies");
  });

  it("renders actions", () => {
    const { getByRole } = render(
      <PageHeader title="Jobs" actions={<button>Post a job</button>} />,
    );
    expect(getByRole("button", { name: "Post a job" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title and description", () => {
    const { getByText } = render(
      <EmptyState icon={Inbox} title="No jobs yet" description="Check back soon." />,
    );
    expect(getByText("No jobs yet")).toBeInTheDocument();
    expect(getByText("Check back soon.")).toBeInTheDocument();
  });

  it("hides its icon from assistive tech", () => {
    // The icon is decorative; the title already carries the meaning.
    const { container } = render(<EmptyState icon={Inbox} title="Nothing here" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FormField", () => {
  it("associates its label with the control", () => {
    const { getByLabelText } = render(
      <FormField label="Email" htmlFor="email">
        <input id="email" />
      </FormField>,
    );
    expect(getByLabelText("Email")).toBeInTheDocument();
  });

  it("links the hint to the control via aria-describedby", () => {
    const { getByLabelText, getByText } = render(
      <FormField label="Salary" htmlFor="salary" hint="In LPA">
        <input id="salary" />
      </FormField>,
    );
    const hint = getByText("In LPA");
    expect(getByLabelText("Salary")).toHaveAttribute("aria-describedby", hint.id);
  });

  it("marks the control invalid and describes it by the error", () => {
    const { getByLabelText, getByRole } = render(
      <FormField label="Email" htmlFor="email" error="That address is not valid">
        <input id="email" />
      </FormField>,
    );
    const input = getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(getByRole("alert")).toHaveTextContent("That address is not valid");
    expect(input.getAttribute("aria-describedby")).toBe(getByRole("alert").id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- layout
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `frontend/src/components/layout/PageShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Density = "spacious" | "compact";
type Width = "narrow" | "default" | "wide";

const WIDTH: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

/**
 * The page container. Sets `data-density`, which is what the spacing custom
 * properties resolve from — the same mechanism `data-portal` uses for signal
 * colour, so a component reads `--space-card` and never asks which surface it
 * is on.
 *
 * Density follows the surface's job, not the portal: /hire is recruiter-scoped
 * but is a marketing page, so it runs spacious.
 */
export function PageShell({
  density = "spacious",
  width = "default",
  className,
  children,
}: {
  density?: Density;
  width?: Width;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-density={density} className="min-h-screen bg-paper text-ink">
      <div
        className={cn(
          "mx-auto px-6 pb-(--space-section) pt-(--space-page-top)",
          WIDTH[width],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/layout/PageHeader.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * Every page gets one of these. Before 2B the workspace screens had no heading
 * at all — a filter input and a table, starting cold — which is why this is a
 * primitive rather than a convention.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-(--space-card) flex items-start justify-between gap-6">
      <div className="min-w-0">
        {/* text-display-sm = 1.777rem, above the 20px Fraunces floor. */}
        <h1 className="font-display text-display-sm font-semibold text-balance text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
```

- [ ] **Step 5: Create `frontend/src/components/layout/EmptyState.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Replaces the bare-text empty states the inherited pages used ("No jobs
 * found", "No skills listed", "No applied jobs found"). Centred deliberately —
 * a standalone empty state is one of the few genuinely centred moments the
 * left-axis rule allows.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-surface border border-line bg-paper-raised px-6 py-16 text-center">
      <Icon aria-hidden="true" className="mb-4 size-8 text-ink-muted" />
      <p className="text-lg font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/src/components/layout/FormField.tsx`**

```tsx
import type { ReactNode } from "react";
import { Children, cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";

/**
 * Label + control + hint + error with one rhythm.
 *
 * The wiring matters more than the spacing: the control is cloned to receive
 * `aria-describedby` and `aria-invalid`, so a hint or an error is announced
 * rather than merely displayed. The inherited pages hardcoded hints as loose
 * `<p>` elements with no association at all.
 *
 * When both a hint and an error are present the error wins the description,
 * because it is the actionable one.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const child = Children.only(children);
  const control = isValidElement<Record<string, unknown>>(child)
    ? cloneElement(child, {
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : child;

  return (
    <div className="mb-(--space-field)">
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- layout
```

Expected: PASS, 9 tests.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/components/layout frontend/tests/layout.test.tsx
git commit -m "feat(web): PageShell, PageHeader, EmptyState, FormField primitives

Density is a data attribute resolving spacing custom properties, mirroring how
data-portal resolves signal colour — pages pass a prop, components read tokens,
nothing branches.

FormField wires aria-describedby and aria-invalid onto the control it wraps.
The inherited forms rendered hints as unassociated <p> elements."
```

---

### Task 5: Auth copy, AuthLayout, PortalPanel

**Files:**
- Create: `frontend/src/components/auth/authCopy.ts`, `AuthLayout.tsx`, `PortalPanel.tsx`, `frontend/src/hooks/usePublicJobCount.ts`
- Test: `frontend/tests/authLayout.test.tsx`

**Interfaces:**
- Consumes: `PageShell` is **not** used here — auth is a full-bleed split, not a contained page.
- Produces:
  - `AUTH_COPY: Record<Portal, { wordmarkSuffix, headline, sub, crossLinkLabel, crossLinkHref }>`
  - `<AuthLayout portal: Portal; title: string; subtitle?: string; children>`
  - `<PortalPanel portal: Portal>`
  - `usePublicJobCount(): { count: number | null; ready: boolean }`

- [ ] **Step 1: Write the failing test at `frontend/tests/authLayout.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import { AuthLayout } from "@/components/auth/AuthLayout";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderAuth(portal: "seeker" | "recruiter") {
  return render(
    <MemoryRouter>
      <div data-portal={portal}>
        <AuthLayout portal={portal} title="Welcome back">
          <button>Continue</button>
        </AuthLayout>
      </div>
    </MemoryRouter>,
  );
}

describe("AuthLayout", () => {
  it("renders its title as the h1", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back");
  });

  it("renders the form children", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("links a seeker to the recruiter world", () => {
    const { getByRole } = renderAuth("seeker");
    expect(getByRole("link", { name: /hiring/i })).toHaveAttribute("href", "/hire");
  });

  it("links a recruiter to the seeker world", () => {
    const { getByRole } = renderAuth("recruiter");
    expect(getByRole("link", { name: /looking for a job/i })).toHaveAttribute("href", "/");
  });

  it("renders no marketing navbar", () => {
    // Auth is a full-height split; the wordmark lives in the form column.
    const { queryByRole } = renderAuth("seeker");
    expect(queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders no portal selector", () => {
    // Regression, bug 1: the portal is a route literal, so no control picks it.
    const { container } = renderAuth("seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- authLayout
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/hooks/usePublicJobCount.ts`**

```ts
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/** Below this, a count reads as "nobody is here" and is worse than no number. */
const MIN_DISPLAYABLE = 10;

/**
 * Open-role count for the seeker auth panel.
 *
 * `GET /job/get` is public (`optionalAuthenticate`) and returns `total`, so
 * this needs no session and no new endpoint. Returns `count: null` when the
 * request fails OR when the number is too small to be worth showing — the
 * caller renders its value-proposition copy in both cases, so a fresh install
 * never advertises "0 open roles".
 */
export function usePublicJobCount(): { count: number | null; ready: boolean } {
  const [count, setCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: true; total: number }>("/job/get", { params: { limit: 1 } })
      .then((res) => {
        if (cancelled) return;
        const total = res.data.total;
        setCount(typeof total === "number" && total >= MIN_DISPLAYABLE ? total : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { count, ready };
}
```

- [ ] **Step 4: Create `frontend/src/components/auth/authCopy.ts`**

```ts
import type { Portal } from "@jobportal/shared";

/**
 * Per-portal strings in one place, keyed by Portal.
 *
 * This table is what makes PortalPanel a single component rather than two: the
 * panel differs by content and signal token, never by structure. If a portal
 * ever needs a different *layout*, that is the signal that direction C has
 * failed — fix it here or revisit the design, do not fork the component.
 */
export const AUTH_COPY: Record<
  Portal,
  {
    wordmarkSuffix: string;
    headline: string;
    sub: string;
    fallbackProof: string;
    crossLinkLabel: string;
    crossLinkHref: string;
    loginHref: string;
    signupHref: string;
  }
> = {
  seeker: {
    wordmarkSuffix: "Portal",
    headline: "Find work that fits.",
    sub: "One profile. Every application tracked in one place.",
    fallbackProof: "New roles are posted by verified companies every week.",
    crossLinkLabel: "Hiring instead?",
    crossLinkHref: "/hire",
    loginHref: "/login",
    signupHref: "/signup",
  },
  recruiter: {
    wordmarkSuffix: "Hire",
    headline: "Hire without the noise.",
    sub: "Post a role, see every applicant, decide faster.",
    fallbackProof: "Applicants arrive with a profile and a resume, already parsed.",
    crossLinkLabel: "Looking for a job?",
    crossLinkHref: "/",
    loginHref: "/hire/login",
    signupHref: "/hire/signup",
  },
};
```

- [ ] **Step 5: Create `frontend/src/components/auth/PortalPanel.tsx`**

```tsx
import type { Portal } from "@jobportal/shared";
import { usePublicJobCount } from "@/hooks/usePublicJobCount";
import { AUTH_COPY } from "./authCopy";

/**
 * The portal-specific half of the auth split.
 *
 * ONE component. It differs by content and by the signal token the portal
 * scope already resolved — never by structure, and never by a `portal === ...`
 * branch that changes layout. Reserve the proof line's height so the panel does
 * not shift when the count resolves.
 */
export function PortalPanel({ portal }: { portal: Portal }) {
  const copy = AUTH_COPY[portal];
  const { count, ready } = usePublicJobCount();

  return (
    <aside className="relative hidden overflow-hidden bg-signal-muted md:flex md:flex-col md:justify-between md:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-signal opacity-10 blur-3xl"
      />
      <div className="relative">
        <p className="font-display text-display-sm font-semibold text-balance text-ink">
          {copy.headline}
        </p>
        <p className="mt-3 max-w-sm text-sm text-ink-muted">{copy.sub}</p>
      </div>

      {/* min-h reserves the line so a late count does not reflow the panel. */}
      <p className="relative min-h-10 text-sm text-ink-muted">
        {!ready ? null : count !== null ? (
          <>
            <span className="font-mono text-lg text-signal-text">
              {count.toLocaleString()}
            </span>{" "}
            open roles right now
          </>
        ) : (
          copy.fallbackProof
        )}
      </p>
    </aside>
  );
}
```

- [ ] **Step 6: Create `frontend/src/components/auth/AuthLayout.tsx`**

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Portal } from "@jobportal/shared";

import { FadeIn } from "@/lib/motion";
import { AUTH_COPY } from "./authCopy";
import { PortalPanel } from "./PortalPanel";

/**
 * Full-height split: form column, portal panel.
 *
 * Deliberately no marketing navbar — the inherited pages mounted <Navbar/> and
 * then floated a w-1/2 card in the remaining space, leaving two thirds of the
 * viewport empty. The wordmark lives in the form column instead.
 *
 * Below `md` the panel is hidden and the form takes the full width.
 */
export function AuthLayout({
  portal,
  title,
  subtitle,
  children,
}: {
  portal: Portal;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const copy = AUTH_COPY[portal];

  return (
    <div className="grid min-h-screen bg-paper md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 md:px-12">
        <FadeIn className="mx-auto w-full max-w-sm">
          <Link to={copy.crossLinkHref === "/" ? "/hire" : "/"} className="inline-block">
            <span className="font-display text-xl font-bold text-ink">
              Job<span className="text-signal-text">{copy.wordmarkSuffix}</span>
            </span>
          </Link>

          <h1 className="mt-10 font-display text-display-sm font-semibold text-ink">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-sm text-ink-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          <p className="mt-10 border-t border-line pt-6 text-sm text-ink-muted">
            {copy.crossLinkLabel}{" "}
            <Link to={copy.crossLinkHref} className="text-signal-text hover:underline">
              {portal === "seeker" ? "Go to hiring" : "Browse jobs"}
            </Link>
          </p>
        </FadeIn>
      </div>

      <PortalPanel portal={portal} />
    </div>
  );
}
```

- [ ] **Step 7: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- authLayout
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/components/auth/authCopy.ts frontend/src/components/auth/AuthLayout.tsx frontend/src/components/auth/PortalPanel.tsx frontend/src/hooks/usePublicJobCount.ts frontend/tests/authLayout.test.tsx
git commit -m "feat(web): AuthLayout split-screen shell and PortalPanel

PortalPanel is one component taking a Portal prop; per-portal strings live in
authCopy.ts. A SeekerPanel/RecruiterPanel pair would mean the shared-language
direction had failed.

usePublicJobCount suppresses counts below 10 so a fresh install renders value
copy rather than \"0 open roles\", and the proof line reserves its height so a
late response does not reflow the panel."
```

---

### Task 6: Login and Signup take portal as a prop

The correctness core of the slice.

**Files:**
- Modify: `frontend/src/components/auth/Login.tsx`, `Signup.tsx`
- Test: `frontend/tests/authForms.test.tsx`

**Interfaces:**
- Consumes: `AuthLayout`, `FormField`, `AUTH_COPY`.
- Produces: `<Login portal: Portal />`, `<Signup portal: Portal />` — both now require the prop. `authRoutes` (Task 7) supplies it.

- [ ] **Step 1: Write the failing test at `frontend/tests/authForms.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import Login from "@/components/auth/Login";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderLogin(portal: "seeker" | "recruiter") {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <div data-portal={portal}>
          <Login portal={portal} />
        </div>
      </MemoryRouter>
    </Provider>,
  );
}

describe("Login", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("has no portal selector", () => {
    // Regression, bug 1. The native radio was unstylable and contradicted
    // PortalScope; the portal is now the route.
    const { container } = renderLogin("seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });

  it("posts to the seeker endpoint when mounted as seeker", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "seeker" } } } as never);

    renderLogin("seeker");
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
    await userEvent.type(screen.getByLabelText(/password/i), "password12345");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(post).toHaveBeenCalledWith("/seeker/auth/login", expect.anything());
  });

  it("posts to the recruiter endpoint when mounted as recruiter", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { user: { id: "1", portal: "recruiter" } } } as never);

    renderLogin("recruiter");
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.test");
    await userEvent.type(screen.getByLabelText(/password/i), "password12345");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(post).toHaveBeenCalledWith("/recruiter/auth/login", expect.anything());
  });

  it("points forgot-password at its own portal", () => {
    renderLogin("recruiter");
    expect(screen.getByRole("link", { name: /forgot/i })).toHaveAttribute(
      "href",
      "/forgot-password?portal=recruiter",
    );
  });

  it("renders exactly one signal-filled primary action", () => {
    // Regression, bug 2: the form's primary was --ink while the navbar's was
    // the portal signal, so the page's main action did not match the app's.
    const { container } = renderLogin("seeker");
    const signalButtons = container.querySelectorAll('[data-slot="button"][data-variant="signal"]');
    expect(signalButtons).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- authForms
```

Expected: FAIL — `Login` does not accept `portal`, and the radio still exists.

- [ ] **Step 3: Rewrite `frontend/src/components/auth/Login.tsx`**

```tsx
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse, Portal } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { setLoading, setUser } from "@/redux/authSlice";
import { setPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";

/**
 * The portal arrives as a prop from the route, never from component state.
 *
 * The version this replaces held it in `useState` and rendered a radio pair, so
 * the endpoint the form posted to and the signal colour PortalScope resolved
 * from the URL could disagree — /login always looked like the seeker portal
 * even with "Recruiter" selected. One route, one portal, no control.
 */
const Login = ({ portal }: { portal: Portal }) => {
  const [input, setInput] = useState({ email: "", password: "" });
  const { loading, user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const copy = AUTH_COPY[portal];

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      dispatch(setLoading(true));
      const res = await apiClient.post<AuthResponse>(`/${portal}/auth/login`, input);
      // Hint written only after the server agreed. Writing it before would leave
      // a failed login pointing the refresh interceptor at the wrong portal.
      setPortalHint(portal);
      dispatch(setUser(res.data.user));
      navigate(portal === "recruiter" ? "/admin/companies" : "/");
    } catch (error) {
      // EMAIL_NOT_VERIFIED is not a failure the user can act on from here — it
      // means "finish signing up". Route them instead of showing a dead end.
      if (getApiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
        navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
        return;
      }
      toast.error(getApiErrorMessage(error, "Login failed"));
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    if (user) navigate(user.portal === "recruiter" ? "/admin/companies" : "/");
  }, [user, navigate]);

  return (
    <AuthLayout portal={portal} title="Welcome back" subtitle={copy.sub}>
      <form onSubmit={submitHandler} noValidate>
        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={input.email}
            onChange={changeEventHandler}
            placeholder="you@example.com"
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={input.password}
            onChange={changeEventHandler}
            placeholder="Your password"
          />
        </FormField>

        <div className="mb-6 text-right">
          <Link
            to={`/forgot-password?portal=${portal}`}
            className="text-sm text-signal-text hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="signal" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          {loading ? "Signing in" : "Sign in"}
        </Button>

        {/*
          A real navigation, not a fetch: the OAuth flow is a series of
          top-level redirects and XHR cannot follow them.
        */}
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            window.location.href = `${import.meta.env.VITE_API_URL}/${portal}/auth/google`;
          }}
        >
          Continue with Google
        </Button>

        <p className="mt-6 text-sm text-ink-muted">
          Don&apos;t have an account?{" "}
          <Link to={copy.signupHref} className="text-signal-text hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Login;
```

- [ ] **Step 4: Rewrite `frontend/src/components/auth/Signup.tsx`**

```tsx
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Portal } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setLoading } from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

/**
 * Portal comes from the route. The inherited form asked for it in a radio pair
 * placed *below* name, email, phone and password — the first decision presented
 * last — and that decision is now made by which URL you are on.
 */
const Signup = ({ portal }: { portal: Portal }) => {
  const [input, setInput] = useState({ fullName: "", email: "", phone: "", password: "" });
  const { loading, user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      dispatch(setLoading(true));
      // JSON, not multipart: the endpoint takes no file. `phone` is optional and
      // omitted entirely when blank — an empty string fails E.164.
      await apiClient.post(`/${portal}/auth/register`, {
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
      });
      // Deliberately no setUser: the API issues no session before verification,
      // so a user here would be a UI that thinks it is signed in and a server
      // that disagrees on the next request.
      navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Signup failed"));
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    if (user) navigate(user.portal === "recruiter" ? "/admin/companies" : "/");
  }, [user, navigate]);

  return (
    <AuthLayout
      portal={portal}
      title={portal === "recruiter" ? "Start hiring" : "Create your account"}
      subtitle={copy.sub}
    >
      <form onSubmit={submitHandler} noValidate>
        <FormField label="Full name" htmlFor="fullName" required>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            value={input.fullName}
            onChange={changeEventHandler}
            placeholder="Your name"
          />
        </FormField>

        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={input.email}
            onChange={changeEventHandler}
            placeholder="you@example.com"
          />
        </FormField>

        <FormField label="Phone" htmlFor="phone" hint="Optional. Include the country code, e.g. +919876543210.">
          <Input
            id="phone"
            name="phone"
            autoComplete="tel"
            value={input.phone}
            onChange={changeEventHandler}
            placeholder="+919876543210"
          />
        </FormField>

        <FormField label="Password" htmlFor="password" hint="At least 12 characters." required>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            value={input.password}
            onChange={changeEventHandler}
            placeholder="Choose a password"
          />
        </FormField>

        <Button type="submit" variant="signal" className="mt-2 w-full" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          {loading ? "Creating account" : "Create account"}
        </Button>

        <p className="mt-6 text-sm text-ink-muted">
          Already have an account?{" "}
          <Link to={copy.loginHref} className="text-signal-text hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Signup;
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- authForms
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/components/auth/Login.tsx frontend/src/components/auth/Signup.tsx frontend/tests/authForms.test.tsx
git commit -m "feat(web): Login and Signup take portal from the route

Deletes the native radio pair. It was the one control in the app outside the
token system (Chrome's accent-color, immune to theme and portal), and it let
the posted endpoint disagree with the signal colour PortalScope resolved from
the URL.

Signup no longer asks for the portal after four other fields; the URL decides."
```

---

### Task 7: Route sets and `/hire` landing

**Files:**
- Create: `frontend/src/routes/authRoutes.tsx`, `frontend/src/pages/HireLanding.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/routing.test.tsx`

**Interfaces:**
- Consumes: `Login`, `Signup` (Task 6); `portalForPath` (Task 3).
- Produces: `buildAuthRoutes(portal, prefix): RouteObject[]`.

- [ ] **Step 1: Write the failing test at `frontend/tests/routing.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { buildAuthRoutes } from "@/routes/authRoutes";

describe("buildAuthRoutes", () => {
  it("mounts seeker auth at the root prefix", () => {
    const paths = buildAuthRoutes("seeker", "").map((r) => r.path);
    expect(paths).toContain("/login");
    expect(paths).toContain("/signup");
  });

  it("mounts recruiter auth under /hire", () => {
    const paths = buildAuthRoutes("recruiter", "/hire").map((r) => r.path);
    expect(paths).toContain("/hire/login");
    expect(paths).toContain("/hire/signup");
  });

  it("produces the same route count for both portals", () => {
    // One component set, two mounts — mirroring buildAuthRouter on the server.
    expect(buildAuthRoutes("seeker", "").length).toBe(
      buildAuthRoutes("recruiter", "/hire").length,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- routing
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/routes/authRoutes.tsx`**

```tsx
import type { RouteObject } from "react-router-dom";
import type { Portal } from "@jobportal/shared";

import Login from "@/components/auth/Login";
import Signup from "@/components/auth/Signup";

/**
 * One component set, mounted twice — the same shape as the API's
 * `buildAuthRouter(portal)` mounted at /seeker/auth and /recruiter/auth.
 *
 * The prefix is the ONLY place a portal is named on the client, and App.tsx
 * passes it as a literal. That is what keeps Portal a route literal: there is
 * no code path where a request value reaches this function.
 *
 * The seven shared pages (verify-email, forgot-password, reset-password and the
 * four OAuth landings) are NOT built here. They are reached by redirect from
 * the Google callback, which targets portal-neutral paths carrying ?portal=,
 * so duplicating them per portal would require a backend change.
 */
export function buildAuthRoutes(portal: Portal, prefix: string): RouteObject[] {
  return [
    { path: `${prefix}/login`, element: <Login portal={portal} /> },
    { path: `${prefix}/signup`, element: <Signup portal={portal} /> },
  ];
}
```

- [ ] **Step 4: Create `frontend/src/pages/HireLanding.tsx`**

```tsx
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, Send, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { FadeIn, StaggerItem, StaggerList } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const STEPS = [
  { icon: ClipboardList, title: "Create a company", body: "One profile your whole team posts under." },
  { icon: Send, title: "Post a role", body: "Title, requirements, salary band, location." },
  { icon: Users, title: "See every applicant", body: "Profile and resume, already parsed." },
];

/**
 * The employer front door.
 *
 * Before this page existed, an anonymous visitor who wanted to hire had nowhere
 * to land: /admin/* redirects them to the seeker home, so someone arriving to
 * post a job was shown "Get Your Dream Job".
 *
 * Marketing surface, so it runs spacious density even though the portal is
 * recruiter — density follows the surface's job, not the portal.
 */
export default function HireLanding() {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.portal === "recruiter") navigate("/admin/companies", { replace: true });
  }, [user?.portal, navigate]);

  return (
    <PageShell width="wide">
      <FadeIn>
        <p className="mb-4 inline-flex rounded-full bg-signal-muted px-3 py-1 text-sm font-medium text-signal-text">
          For employers
        </p>
        <h1 className="max-w-3xl font-display text-display-lg font-bold text-balance text-ink">
          Hire without the noise.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          Post a role, see every applicant in one place, and decide faster.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild variant="signal" size="lg">
            <Link to="/hire/signup">
              Start hiring <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/hire/login">Sign in</Link>
          </Button>
        </div>
      </FadeIn>

      <StaggerList className="mt-(--space-section) grid gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <StaggerItem key={step.title}>
            <div className="h-full rounded-surface border border-line bg-paper-raised p-(--space-card)">
              <step.icon aria-hidden="true" className="mb-3 size-5 text-signal-text" />
              <h2 className="font-display text-xl font-semibold text-ink">{step.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerList>

      <p className="mt-(--space-section) border-t border-line pt-6 text-sm text-ink-muted">
        Looking for a job instead?{" "}
        <Link to="/" className="text-signal-text hover:underline">
          Browse open roles
        </Link>
      </p>
    </PageShell>
  );
}
```

- [ ] **Step 5: Modify `frontend/src/App.tsx`**

Replace the `Login`/`Signup` imports and their two route entries. Remove:

```tsx
import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
```

Add near the other imports:

```tsx
import { buildAuthRoutes } from "./routes/authRoutes";
import HireLanding from "./pages/HireLanding";
```

Replace these two children entries:

```tsx
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
```

with:

```tsx
      // One component set, two mounts. The prefix is the only place a portal is
      // named on the client, and both are literals here.
      ...buildAuthRoutes("seeker", ""),
      ...buildAuthRoutes("recruiter", "/hire"),
      { path: "/hire", element: <HireLanding /> },
```

- [ ] **Step 6: Run the full suite**

```bash
npm run test --workspace @jobportal/web
```

Expected: all green, including the 3 new routing tests.

- [ ] **Step 7: Verify the routes serve**

```bash
cd frontend && npx vite --port 5173 --strictPort &
timeout 60 bash -c 'until curl -sf http://localhost:5173/hire >/dev/null 2>&1; do sleep 1; done'
for p in /login /signup /hire /hire/login /hire/signup; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173$p)"
done
netstat -ano | grep LISTENING | grep ':5173' | awk '{print $NF}' | sort -u | while read pid; do taskkill //PID $pid //F; done
```

Expected: `200` for all five.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/routes frontend/src/pages/HireLanding.tsx frontend/src/App.tsx frontend/tests/routing.test.tsx
git commit -m "feat(web): split auth routes by portal, add /hire employer landing

buildAuthRoutes mounts one component set twice, mirroring the API's
buildAuthRouter(portal). The prefix is the only place a portal is named on the
client and both call sites pass a literal.

/hire is the employer front door that did not exist: an anonymous visitor at
/admin/* was redirected to the seeker home and shown \"Get Your Dream Job\"."
```

---

### Task 8: Shared auth pages adopt AuthLayout

**Files:**
- Modify: `frontend/src/components/auth/VerifyEmail.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthComplete.tsx`, `LinkPending.tsx`, `ConfirmGoogleLink.tsx`, `AuthError.tsx`
- Test: `frontend/tests/sharedAuth.test.tsx`

**Interfaces:**
- Consumes: `AuthLayout`, `FormField`, `usePortalParam`.
- Produces: nothing new.

Each of the seven keeps its existing logic exactly — only the wrapper changes. Do not alter any handler, redirect, or error branch.

- [ ] **Step 1: Write the failing test at `frontend/tests/sharedAuth.test.tsx`**

```tsx
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import VerifyEmail from "@/components/auth/VerifyEmail";
import ForgotPassword from "@/components/auth/ForgotPassword";

vi.mock("@/hooks/usePublicJobCount", () => ({
  usePublicJobCount: () => ({ count: null, ready: true }),
}));

function renderAt(ui: React.ReactElement, route: string) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe("shared auth pages", () => {
  it("VerifyEmail renders no marketing navbar", () => {
    const { queryByRole } = renderAt(<VerifyEmail />, "/verify-email?portal=seeker&email=a@b.test");
    expect(queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("VerifyEmail shows the address it is verifying", () => {
    const { getByText } = renderAt(<VerifyEmail />, "/verify-email?portal=seeker&email=a@b.test");
    expect(getByText("a@b.test")).toBeInTheDocument();
  });

  it("ForgotPassword reads the portal from the query param", () => {
    // These pages are reached by redirect from the OAuth callback, which targets
    // portal-neutral paths carrying ?portal=. The param stays load-bearing here
    // even though PortalScope ignores it.
    const { getByRole } = renderAt(<ForgotPassword />, "/forgot-password?portal=recruiter");
    expect(getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("renders no portal selector", () => {
    const { container } = renderAt(<ForgotPassword />, "/forgot-password?portal=seeker");
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- sharedAuth
```

Expected: FAIL — `<Navbar/>` still renders a `navigation` role.

- [ ] **Step 3: Convert each of the seven**

For every file, apply exactly this transformation and nothing else:

1. Delete `import Navbar from "../shared/Navbar";`
2. Delete `import { Label } from "../ui/label";` if the labels move into `FormField`.
3. Add `import { AuthLayout } from "./AuthLayout";` and, where the page has inputs, `import { FormField } from "../layout/FormField";`
4. Replace the outer JSX — the `<div><Navbar /><div className="flex items-center justify-center max-w-7xl mx-auto"><form className="w-1/2 border border-gray-200 rounded-md p-4 my-10">` scaffold — with `<AuthLayout portal={portal} title="…" subtitle="…"><form …>`.
5. Wrap each `Label` + `Input` pair in a `FormField` with a matching `htmlFor`/`id`.
6. Change the submit `Button` to `variant="signal"` and `className="w-full"`.

Titles and subtitles to use:

| File | title | subtitle |
|---|---|---|
| `VerifyEmail.tsx` | `Verify your email` | `We sent a 6-digit code to {email}.` |
| `ForgotPassword.tsx` | `Reset your password` | `We'll email you a code if that address has an account.` |
| `ResetPassword.tsx` | `Choose a new password` | `Enter the code we emailed you.` |
| `AuthComplete.tsx` | `Signing you in` | *(none)* |
| `LinkPending.tsx` | `Check your email` | `We sent a link to finish connecting your Google account.` |
| `ConfirmGoogleLink.tsx` | `Connect your Google account` | `Confirm to sign in with Google from now on.` |
| `AuthError.tsx` | `That didn't work` | `Sign-in could not be completed. Try again.` |

For pages without a `portal` variable in scope, add `const portal = usePortalParam();` — `AuthComplete`, `ConfirmGoogleLink`, `VerifyEmail`, `ForgotPassword`, and `ResetPassword` already have it. `LinkPending` and `AuthError` carry no portal; pass `portal="seeker"` and add this comment:

```tsx
{/* No portal in the URL for this outcome — the backend redirects here without
    one. Seeker is the default scope, matching PortalScope's fallback. */}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- sharedAuth
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite and the colour grep**

```bash
npm run test --workspace @jobportal/web
cd frontend && npm run lint:colour
```

The colour grep should now report fewer violations — every `border-gray-200` in the auth pages is gone. Remaining hits are in files this slice has not reached yet (`Job.tsx`, `FilterCard.tsx`, admin components).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add frontend/src/components/auth frontend/tests/sharedAuth.test.tsx
git commit -m "feat(web): shared auth pages adopt AuthLayout

The seven OAuth and OTP surfaces keep every handler, redirect and error branch
unchanged — only the shell moves. They continue to read ?portal= because the
backend redirects to portal-neutral paths; PortalScope still ignores it."
```

---

### Task 9: Navbar account menu, landing rebuild, footer

**Files:**
- Modify: `frontend/src/components/shared/Navbar.tsx`, `Home.tsx`, `HeroSection.tsx`, `LatestJobs.tsx`, `Footer.tsx`
- Test: `frontend/tests/navbar.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `PageShell`, motion composables.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test at `frontend/tests/navbar.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import { setUser } from "@/redux/authSlice";
import Navbar from "@/components/shared/Navbar";

function storeWithUser(portal: "seeker" | "recruiter") {
  const s = makeStore();
  s.dispatch(
    setUser({
      id: "u1",
      fullName: "Arjun Mehta",
      email: "arjun@example.test",
      portal,
      avatarUrl: null,
    } as never),
  );
  return s;
}

describe("Navbar account menu", () => {
  it("renders a visible avatar trigger when avatarUrl is null", () => {
    // Regression, bug 3. AvatarImage with a null src renders nothing and there
    // was no AvatarFallback sibling, so the trigger collapsed to an empty
    // circle and sign-out became unreachable on both portals.
    const { getByText } = render(
      <Provider store={storeWithUser("seeker")}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </Provider>,
    );
    expect(getByText("AM")).toBeInTheDocument();
  });

  it("shows auth links when signed out", () => {
    const { getByRole } = render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </Provider>,
    );
    expect(getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test --workspace @jobportal/web -- navbar
```

Expected: FAIL — no "AM" text; the avatar renders empty.

- [ ] **Step 3: Add initials + `AvatarFallback` to `Navbar.tsx`**

Add the import:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
```

Add above the component:

```tsx
/**
 * Up to two initials from a display name.
 *
 * The avatar trigger needs content that survives a null avatarUrl — which is
 * every account created through the standard flow, since nothing uploads a
 * picture at registration. Without a fallback the trigger is a zero-content
 * circle and the sign-out inside it cannot be reached.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
```

Then give **both** `Avatar` blocks (the trigger at `:85` and the one inside `PopoverContent` at `:94`) a fallback child:

```tsx
<Avatar className="cursor-pointer">
  <AvatarImage src={user?.avatarUrl ?? undefined} alt="" />
  <AvatarFallback>{initialsOf(user?.fullName ?? "")}</AvatarFallback>
</Avatar>
```

Note `alt=""`: the accessible name comes from the trigger's own label, and a duplicated name is read twice by a screen reader.

- [ ] **Step 4: Align the signed-out links and replace the last non-token colour**

`Navbar.tsx:104` has `className="flex flex-col my-2 text-gray-600"`. Change
`text-gray-600` to `text-ink-muted`.

In the signed-out branch (`Navbar.tsx:73-81`), the buttons currently read
"Login" and "Signup". Change the labels to **"Sign in"** and **"Get started"**
to match the auth pages' own verbs (`Sign in` / `Create account`) — the test in
Step 1 asserts the "Sign in" name. Keep `variant="outline"` on the first and
change the second to `variant="signal"`.

- [ ] **Step 5: Rewrite `frontend/src/components/Footer.tsx`**

Replace lines 5-11 (the `<footer>` open tag and the wordmark block):

```tsx
    <footer className="border-t border-line py-8">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <div className="mb-4 md:mb-0">
            <h2 className="font-display text-xl font-bold text-ink">
              Job<span className="text-signal-text">Portal</span>
            </h2>
            <p className="text-sm text-ink-muted">
              © {new Date().getFullYear()} JobPortal. All rights reserved.
            </p>
          </div>
```

and change the three social anchors' `className="hover:text-gray-400"` to `className="text-ink-muted transition-colors duration-(--dur-fast) hover:text-signal-text"`.

- [ ] **Step 6: Move the hero to the left axis in `HeroSection.tsx`**

Replace the outer `<div className="text-center">` with `<div>`, replace `className="flex flex-col gap-5 my-10"` with `className="flex flex-col gap-5 py-(--space-section)"`, remove `mx-auto` from the badge span, and change the search container's `w-[40%] ... mx-auto` to `w-full max-w-xl`. Wrap the whole block in `<FadeIn>` imported from `@/lib/motion`.

- [ ] **Step 7: Give `LatestJobs.tsx` a real empty state**

Replace the bare `No Job Available` text with:

```tsx
<EmptyState
  icon={Briefcase}
  title="No openings right now"
  description="New roles are posted regularly. Check back soon."
/>
```

importing `EmptyState` from `@/components/layout/EmptyState` and `Briefcase` from `lucide-react`. Wrap the job card grid in `StaggerList` / `StaggerItem` from `@/lib/motion`.

- [ ] **Step 8: Point `index.html` at the real entry file**

`frontend/index.html:11` loads `/src/main.jsx`, but the entry is `main.tsx`.
Vite's extension fallback resolves it in dev, so this has never surfaced —
but it is luck, not design, and `vite build` resolves entries differently.
Change the script tag and the stale title:

```html
    <title>JobPortal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
```

(The title is currently `Vite + React`, which is what the browser tab and every
bookmark show.)

- [ ] **Step 9: Verify the production build still resolves**

```bash
npm run build --workspace @jobportal/web
```

Expected: build succeeds. Confirm `dist/index.html` references a hashed asset
and that `/_design` is absent from the bundle, per 2A's guarantee:

```bash
cd frontend && grep -rl "DesignGallery" dist/ || echo "gallery absent from dist — correct"
```

- [ ] **Step 10: Run to verify it passes**

```bash
npm run test --workspace @jobportal/web -- navbar
```

Expected: PASS, 2 tests.

- [ ] **Step 11: Full suite, typecheck, lint, commit**

```bash
npm run test --workspace @jobportal/web && npm run typecheck && npm run lint
git add frontend/src/components/shared/Navbar.tsx frontend/src/components/Footer.tsx frontend/src/components/HeroSection.tsx frontend/src/components/LatestJobs.tsx frontend/src/components/Home.tsx frontend/index.html frontend/tests/navbar.test.tsx
git commit -m "fix(web): make the account menu reachable, rebuild landing on the left axis

AvatarImage with a null src renders nothing and had no AvatarFallback sibling,
so the popover trigger was a zero-content circle and sign-out was unreachable
for every account without an uploaded picture — which is all of them.

Landing moves to one left spine, gains a real empty state, and the footer stops
claiming © 2024 Your Company. index.html now points at main.tsx rather than
relying on Vite's extension fallback for a main.jsx that does not exist."
```

---

### Task 10: Visual verification and contrast audit

**Files:**
- Create: `frontend/tests/visual/run.mjs`, `frontend/tests/visual/contrast.mjs`

**Interfaces:**
- Consumes: every rebuilt route.
- Produces: screenshots under `frontend/tests/visual/shots/` (gitignored) and a pass/fail contrast report.

- [ ] **Step 1: Add the shots directory to `.gitignore`**

```bash
echo "frontend/tests/visual/shots/" >> .gitignore
```

- [ ] **Step 2: Create `frontend/tests/visual/contrast.mjs`**

```js
// WCAG contrast for the token pairings this slice introduces.
//
// Colours are resolved through a real browser colour pipeline, NOT by parsing
// oklch() components as if they were sRGB channels — that mistake produced a
// confident 2.42:1 for a pairing that actually measures 9.08:1 during the
// design investigation, and nearly put a non-existent bug into the spec.
import { chromium } from "playwright";

const PAIRINGS = [
  ["light seeker --signal-text on --paper", "oklch(0.47 0.19 282)", "oklch(0.99 0.004 95)"],
  ["dark seeker --signal-text on --paper", "oklch(0.78 0.15 282)", "oklch(0.165 0.006 95)"],
  ["light recruiter --signal-text on --paper", "oklch(0.45 0.11 185)", "oklch(0.99 0.004 95)"],
  ["dark recruiter --signal-text on --paper", "oklch(0.80 0.12 185)", "oklch(0.165 0.006 95)"],
  ["light --ink-muted on --paper", "oklch(0.52 0.008 95)", "oklch(0.99 0.004 95)"],
  ["dark --ink-muted on --paper", "oklch(0.68 0.006 95)", "oklch(0.165 0.006 95)"],
  ["light --signal-fg on --signal-text (seeker)", "oklch(0.99 0.004 95)", "oklch(0.47 0.19 282)"],
  ["dark --signal-fg on --signal-text (seeker)", "oklch(0.165 0.006 95)", "oklch(0.78 0.15 282)"],
  ["light --signal-fg on --signal-text (recruiter)", "oklch(0.99 0.004 95)", "oklch(0.45 0.11 185)"],
  ["dark --signal-fg on --signal-text (recruiter)", "oklch(0.165 0.006 95)", "oklch(0.80 0.12 185)"],
  // Panel: --ink and --ink-muted over --signal-muted, which is --signal at 12%
  // (light) / 18% (dark) composited on --paper. Composite first.
  ["light --ink on seeker panel", "oklch(0.18 0.008 95)", "color-mix(in oklch, oklch(0.58 0.19 282) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink on seeker panel", "oklch(0.96 0.004 95)", "color-mix(in oklch, oklch(0.72 0.17 282) 18%, oklch(0.165 0.006 95))"],
  ["light --ink-muted on seeker panel", "oklch(0.52 0.008 95)", "color-mix(in oklch, oklch(0.58 0.19 282) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted on seeker panel", "oklch(0.68 0.006 95)", "color-mix(in oklch, oklch(0.72 0.17 282) 18%, oklch(0.165 0.006 95))"],
  ["light --ink on recruiter panel", "oklch(0.18 0.008 95)", "color-mix(in oklch, oklch(0.60 0.13 185) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink on recruiter panel", "oklch(0.96 0.004 95)", "color-mix(in oklch, oklch(0.74 0.13 185) 18%, oklch(0.165 0.006 95))"],
  ["light --ink-muted on recruiter panel", "oklch(0.52 0.008 95)", "color-mix(in oklch, oklch(0.60 0.13 185) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted on recruiter panel", "oklch(0.68 0.006 95)", "color-mix(in oklch, oklch(0.74 0.13 185) 18%, oklch(0.165 0.006 95))"],
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
await page.goto("about:blank");

const results = await page.evaluate((pairs) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const toRgb = (color) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  return pairs.map(([label, fg, bg]) => {
    const a = lum(toRgb(fg));
    const b = lum(toRgb(bg));
    return { label, ratio: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)) };
  });
}, PAIRINGS);

await browser.close();

let failed = 0;
for (const { label, ratio } of results) {
  const ok = ratio >= 4.5;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(ratio).padStart(6)}:1  ${label}`);
}
console.log(`\n${results.length - failed}/${results.length} pairings clear 4.5:1`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the audit**

```bash
cd frontend && node tests/visual/contrast.mjs
```

Expected: every pairing PASS, exit 0. If a panel pairing fails, adjust `--signal-muted`'s alpha in `index.css` rather than hand-picking a new text colour — the fill is the variable under your control.

- [ ] **Step 4: Create `frontend/tests/visual/run.mjs`**

```js
// Screenshots every rebuilt route in both themes and asserts no console errors.
// Assumes a dev server on $BASE (default 5173) and, for authenticated routes,
// nothing — all routes here are anonymous.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["landing", "/"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["hire", "/hire"],
  ["hire-login", "/hire/login"],
  ["hire-signup", "/hire/signup"],
  ["verify-email", "/verify-email?portal=seeker&email=demo%40example.test"],
  ["forgot-password", "/forgot-password?portal=seeker"],
];

const browser = await chromium.launch({ channel: "chrome" });
let failures = 0;

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);

  for (const [name, path] of ROUTES) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });

    // The portal the page resolved to, asserted against the URL it is on.
    const portal = await page.getAttribute("[data-portal]", "data-portal");
    const expected = path === "/hire" || path.startsWith("/hire/") ? "recruiter" : "seeker";
    if (portal !== expected) {
      console.log(`FAIL  ${theme}/${name}: portal=${portal}, expected ${expected}`);
      failures++;
    }

    // No native radio survives anywhere.
    const radios = await page.locator('input[type="radio"]').count();
    if (radios > 0) {
      console.log(`FAIL  ${theme}/${name}: ${radios} native radio(s) present`);
      failures++;
    }
  }

  // CORS/network errors are expected when no API is running; anything else is not.
  const real = [...new Set(errors)].filter(
    (e) => !/CORS|Network Error|ERR_FAILED|Failed to load resource/i.test(e),
  );
  if (real.length) {
    console.log(`FAIL  ${theme}: console errors\n  ${real.join("\n  ")}`);
    failures += real.length;
  }

  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nvisual pass: OK" : `\nvisual pass: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 5: Run it against a live dev server**

```bash
cd frontend && npx vite --port 5173 --strictPort &
timeout 60 bash -c 'until curl -sf http://localhost:5173/login >/dev/null 2>&1; do sleep 1; done'
node tests/visual/run.mjs
netstat -ano | grep LISTENING | grep ':5173' | awk '{print $NF}' | sort -u | while read pid; do taskkill //PID $pid //F; done
```

Expected: `visual pass: OK`. Open several screenshots and look at them — the assertions catch portal and radio regressions, not whether the pages read well.

- [ ] **Step 6: Final full verification**

```bash
npm run ci
cd frontend && npm run lint:colour
```

`lint:colour` will still report hits in `Job.tsx`, `FilterCard.tsx`, `AppliedJobTable.tsx`, and the admin components — those files belong to 2B-2 and 2B-3. Record the exact remaining list in the commit message so the next slice inherits it.

- [ ] **Step 7: Commit**

```bash
git add frontend/tests/visual .gitignore
git commit -m "test(web): contrast audit and visual pass for the rebuilt routes

The contrast script resolves colours through the browser rather than parsing
oklch() components as sRGB — the latter reported 2.42:1 for a pairing that
measures 9.08:1 and nearly put a phantom bug in the spec.

The visual pass asserts portal resolution against the URL and that no native
radio survives, in both themes."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: route architecture → 3, 7; portal selector deletion → 6; shared pages keep `?portal=` → 8; session model → 6 (redirects); type roles → constraints + 4; left axis → 9; density → 1, 4; one primary → 6, and asserted in 6; motion → 5, 7, 9; composition primitives → 4, 5; surfaces table → 6, 7, 8, 9; bug 1 → 6; bug 2 → 6; bug 3 → 9; test runner → 2; static and visual checks → 1, 10; ESLint gap → 1; footer copy → 9; `index.html` entry → 9 (added after the first review pass found it unassigned).

**Type consistency.** `portalForPath` (Task 3) is used by tests only; `buildAuthRoutes(portal, prefix)` (Task 7) matches its call sites in `App.tsx`. `AUTH_COPY` keys used in Tasks 5 and 6 — `wordmarkSuffix`, `headline`, `sub`, `fallbackProof`, `crossLinkLabel`, `crossLinkHref`, `loginHref`, `signupHref` — all appear in the Task 5 definition. `usePublicJobCount` returns `{ count, ready }` in both its definition and its two mocks. `FormField`'s props match every call site in Task 6.

**One gap found and fixed:** Task 6's `Login` navigates recruiters to `/admin/companies` on success, but `Home.tsx` also redirects recruiters. Both are correct and idempotent — the second is a no-op — so no change is needed, but Task 9 should not remove `Home.tsx`'s redirect.

**One defect found and fixed:** the first draft's test helpers imported the app's store from `@/redux/store`, which is wrapped in redux-persist and rehydrates from `localStorage`. A test dispatching a signed-in user would have leaked it into every later test, making failures depend on file execution order. Task 2 now exports `makeStore()` — same reducers, no persistence, fresh per render — and all four test files use it.

**One inconsistency found and fixed:** the Navbar test asserts a link named "Sign in", but the current navbar renders "Login". Task 9 Step 4 now renames the signed-out buttons to "Sign in" / "Get started", matching the auth pages' own verbs.

**Placeholder scan:** none. Every code step contains the content to write.

---

## Appendix: running the app with real data

`npm run dev:api` needs `backend/.env`. Registration requires an email OTP, and `BREVO_API_KEY` is a placeholder in dev, so no mail is sent — and the OTP is deliberately never logged (CLAUDE.md: "never log a code"). Two ways to get a verified account:

1. **Recover the code from the database.** `otpcodes.codeHash` is `HMAC-SHA256(OTP_PEPPER, "<subjectId>:<code>")` over a 10^6 space, so a short brute-force against the local dev pepper recovers it. Sound only against throwaway local data.
2. **Set the account verified directly** in Mongo, skipping the OTP.

Accounts live in per-portal collections (`seekers`, `recruiters`), not a shared `users` collection — that one was dropped by the 1C migration.

`jobCreateBodySchema` takes `position` as a **string** (a department, e.g. "Engineering"), not a count. `Job.tsx:52` renders `{job.position} Positions`, which produces "Engineering Positions" — a 2B-2 fix, listed in the spec's deferred defects.

Also note: `CLIENT_URLS` in `backend/.env` is `http://localhost:5173` only. If Vite falls back to 5174 because 5173 is occupied, every API call fails CORS. Always start Vite with `--port 5173 --strictPort` and free the port first.
