# Phase 2A — Ink & Signal Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock shadcn zero-chroma theme with the Ink & Signal token system, make dark mode and portal-scoped signal colour actually work, rebuild 12 + add 8 primitives on tokens only, and ship a DEV-only `/_design` gallery.

**Architecture:** All colour/radius/type/motion decisions live as CSS custom properties in `frontend/src/index.css`, mapped into Tailwind 4 via `@theme inline`. A `ThemeProvider` (next-themes) toggles `.dark`; a `PortalScope` wrapper sets `data-portal` from the route. Components consume Tailwind utility classes that resolve to tokens — no component knows about themes or portals.

**Tech Stack:** React 19, Vite 7, Tailwind 4 (`@tailwindcss/vite`), CVA, Radix (`radix-ui` umbrella + `@radix-ui/*`), framer-motion 12, next-themes, `@fontsource-variable/*`.

## Global Constraints

- Frontend-only; no backend change.
- No component sets a colour outside the token system. Exit grep (must return nothing): `grep -rE '(bg|text|border)-\[#|(bg|text|border)-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan)-[0-9]' frontend/src`
- `Portal` is `"seeker" | "recruiter"`, always a route literal — `data-portal` is set from the route, never from body/query/cookie.
- Signal is the only high-chroma hue; reserved for interactive affordance, never semantic state. Semantic state always icon **and** label, never colour alone.
- Filled elements carrying text use `--signal-text` fill + `--signal-fg` text (AA); base `--signal` is non-text use only.
- Fonts self-hosted via `@fontsource-variable`, latin subset, `font-display: swap`. No CDN.
- Radius: `--radius-sharp` 4px (inputs, badges, table cells, dense controls), `--radius-surface` 16px (cards, panels, dialogs), `--radius-full` 9999px.
- Motion: one easing `cubic-bezier(0.22, 1, 0.36, 1)`; durations 120/200/380ms; every composable no-ops under `prefers-reduced-motion: reduce`.
- Elevation = lightness step on `--paper-*`; shadows only on true overlays (dialog, popover, dropdown, sheet).
- `/_design` mounted only when `import.meta.env.DEV`; must be absent from `dist/` after build.
- No frontend test runner in this slice (deferred to 2B). Verification = typecheck + lint + build + grep + visual gallery review.
- ESM frontend uses `Bundler` resolution — **no** `.js` extensions on relative imports.
- Commit after each task; conventional-commit messages; no Co-Authored-By trailer (repo convention).

---

### Task 1: Token foundation — index.css rewrite, fonts, App.css deletion

**Files:**
- Modify: `frontend/src/index.css` (full rewrite)
- Modify: `frontend/src/App.tsx:1` (remove `import "./App.css";`)
- Delete: `frontend/src/App.css`
- Modify: `frontend/package.json` (add fontsource deps)
- Modify: `frontend/src/main.tsx` (font imports)

**Interfaces:**
- Produces: Tailwind utilities `bg-paper`, `bg-paper-sunken`, `bg-paper-raised`, `text-ink`, `text-ink-muted`, `border-line`, `bg-signal`, `text-signal-text`, `bg-signal-text`, `text-signal-fg`, `bg-signal-muted`, `ring-signal-ring`, `text-danger`/`bg-danger`, `text-warn`/`bg-warn`, `text-ok`/`bg-ok`, `rounded-sharp`, `rounded-surface`, `rounded-full`, `font-display`, `font-sans`, `font-mono`, and text sizes `text-xs…text-display-xl`. CSS vars `--dur-fast|base|slow`, `--ease-out-quint` for Task 3.

- [ ] **Step 1: Install fonts**

```bash
npm install --workspace @jobportal/web @fontsource-variable/fraunces @fontsource-variable/geist @fontsource-variable/geist-mono
```

- [ ] **Step 2: Import fonts in `main.tsx`** (top of file, before `./index.css` import)

```tsx
import "@fontsource-variable/fraunces";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
```

- [ ] **Step 3: Rewrite `frontend/src/index.css`** with exactly this content:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* surfaces & ink */
  --color-paper: var(--paper);
  --color-paper-sunken: var(--paper-sunken);
  --color-paper-raised: var(--paper-raised);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-line: var(--line);

  /* signal (portal-scoped) */
  --color-signal: var(--signal);
  --color-signal-text: var(--signal-text);
  --color-signal-fg: var(--signal-fg);
  --color-signal-muted: var(--signal-muted);
  --color-signal-ring: var(--signal-ring);

  /* semantics — hues 25 / 75 / 145 */
  --color-danger: var(--danger);
  --color-danger-fg: var(--danger-fg);
  --color-warn: var(--warn);
  --color-warn-fg: var(--warn-fg);
  --color-ok: var(--ok);
  --color-ok-fg: var(--ok-fg);

  /* shadcn-compat aliases so existing components keep compiling until 2B/2C.
     They resolve to Ink & Signal tokens — no separate palette. */
  --color-background: var(--paper);
  --color-foreground: var(--ink);
  --color-card: var(--paper-raised);
  --color-card-foreground: var(--ink);
  --color-popover: var(--paper-raised);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--ink);
  --color-primary-foreground: var(--paper);
  --color-secondary: var(--paper-sunken);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--paper-sunken);
  --color-muted-foreground: var(--ink-muted);
  --color-accent: var(--signal-muted);
  --color-accent-foreground: var(--ink);
  --color-destructive: var(--danger);
  --color-border: var(--line);
  --color-input: var(--line);
  --color-ring: var(--signal-ring);

  /* radius */
  --radius-sharp: 4px;
  --radius-surface: 16px;
  /* keep legacy names mapped until 2B removes their consumers */
  --radius-sm: 4px;
  --radius-md: 4px;
  --radius-lg: 16px;
  --radius-xl: 16px;

  /* type */
  --font-display: "Fraunces Variable", Georgia, "Times New Roman", serif;
  --font-sans: "Geist Variable", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", "Cascadia Mono", Consolas, monospace;

  /* type scale — 1.2 ratio UI, 1.333 display */
  --text-xs: 0.694rem;
  --text-sm: 0.833rem;
  --text-base: 1rem;
  --text-lg: 1.2rem;
  --text-xl: 1.44rem;
  --text-display-sm: 1.777rem;
  --text-display-md: 2.369rem;
  --text-display-lg: 3.157rem;
  --text-display-xl: 4.209rem;
}

:root {
  /* Ink & Signal light — warm neutrals, hue 95 */
  --paper: oklch(0.99 0.004 95);
  --paper-sunken: oklch(0.972 0.005 95);
  --paper-raised: oklch(0.998 0.003 95);
  --ink: oklch(0.18 0.008 95);
  --ink-muted: oklch(0.52 0.008 95);
  --line: oklch(0.9 0.005 95);

  /* semantics: danger 25 / warn 75 / ok 145 */
  --danger: oklch(0.55 0.19 25);
  --danger-fg: oklch(0.99 0.004 95);
  --warn: oklch(0.62 0.14 75);
  --warn-fg: oklch(0.18 0.008 95);
  --ok: oklch(0.55 0.14 145);
  --ok-fg: oklch(0.99 0.004 95);

  /* motion */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 380ms;
}

.dark {
  --paper: oklch(0.165 0.006 95);
  --paper-sunken: oklch(0.135 0.006 95);
  --paper-raised: oklch(0.205 0.007 95);
  --ink: oklch(0.96 0.004 95);
  --ink-muted: oklch(0.68 0.006 95);
  --line: oklch(1 0 0 / 9%);

  --danger: oklch(0.68 0.17 25);
  --danger-fg: oklch(0.165 0.006 95);
  --warn: oklch(0.75 0.13 75);
  --warn-fg: oklch(0.165 0.006 95);
  --ok: oklch(0.7 0.13 145);
  --ok-fg: oklch(0.165 0.006 95);
}

/* Signal — portal scoped. Default (no attribute) = seeker. */
:root,
[data-portal="seeker"] {
  --signal: oklch(0.58 0.19 282);
  --signal-text: oklch(0.47 0.19 282);
  --signal-fg: oklch(0.99 0.004 95);
  --signal-muted: oklch(0.58 0.19 282 / 12%);
  --signal-ring: oklch(0.58 0.19 282 / 45%);
}
[data-portal="recruiter"] {
  --signal: oklch(0.6 0.13 185);
  --signal-text: oklch(0.45 0.11 185);
  --signal-fg: oklch(0.99 0.004 95);
  --signal-muted: oklch(0.6 0.13 185 / 12%);
  --signal-ring: oklch(0.6 0.13 185 / 45%);
}
.dark,
.dark [data-portal="seeker"] {
  --signal: oklch(0.72 0.17 282);
  --signal-text: oklch(0.78 0.15 282);
  --signal-fg: oklch(0.165 0.006 95);
  --signal-muted: oklch(0.72 0.17 282 / 18%);
  --signal-ring: oklch(0.72 0.17 282 / 55%);
}
.dark [data-portal="recruiter"] {
  --signal: oklch(0.74 0.13 185);
  --signal-text: oklch(0.8 0.12 185);
  --signal-fg: oklch(0.165 0.006 95);
  --signal-muted: oklch(0.74 0.13 185 / 18%);
  --signal-ring: oklch(0.74 0.13 185 / 55%);
}

@layer base {
  * {
    @apply border-line outline-signal-ring/50;
  }
  body {
    @apply bg-paper text-ink font-sans antialiased;
  }
  h1, h2, h3 {
    @apply font-display;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 4: Delete `App.css` and its import**

Remove line 1 of `frontend/src/App.tsx` (`import "./App.css";`) then:

```bash
git rm frontend/src/App.css
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck --workspace @jobportal/web && npm run lint --workspace @jobportal/web && npm run build --workspace @jobportal/web`
Expected: all pass. (Existing components still compile via the compat aliases.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): Ink & Signal token foundation — warm neutrals, portal-scoped signal, self-hosted type"
```

---

### Task 2: ThemeProvider and PortalScope

**Files:**
- Create: `frontend/src/components/theme/ThemeProvider.tsx`
- Create: `frontend/src/components/theme/ThemeToggle.tsx`
- Create: `frontend/src/components/theme/PortalScope.tsx`
- Modify: `frontend/src/main.tsx` (wrap `<App />`)
- Modify: `frontend/src/App.tsx` (wrap router element tree with `PortalScope` via a layout route)

**Interfaces:**
- Consumes: nothing beyond next-themes and react-router (both installed).
- Produces: `ThemeProvider` (props: `children`), `ThemeToggle` (no props; renders a button), `PortalScope` (props: `children`) — sets `data-portal="recruiter"` for paths starting `/admin`, else `"seeker"`.

- [ ] **Step 1: Create `ThemeProvider.tsx`**

```tsx
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Create `ThemeToggle.tsx`**

```tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves the theme only on the client; render nothing until
  // mounted so the icon can't disagree with the applied class.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Button variant="ghost" size="icon" aria-hidden />;

  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
    >
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
```

- [ ] **Step 3: Create `PortalScope.tsx`**

```tsx
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state. /admin/* is the recruiter surface; everything
 * else renders with the seeker signal.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const portal = pathname.startsWith("/admin") ? "recruiter" : "seeker";
  return <div data-portal={portal}>{children}</div>;
}
```

- [ ] **Step 4: Mount both.** In `main.tsx`, wrap `<App />` in `<ThemeProvider>`. In `App.tsx`, `PortalScope` needs router context, so convert the router to use a pathless layout route:

```tsx
import { Outlet } from "react-router-dom";
import { PortalScope } from "./components/theme/PortalScope";

function RootLayout() {
  return (
    <PortalScope>
      <Outlet />
    </PortalScope>
  );
}

const appRouter = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      /* …every existing route object moves here unchanged… */
    ],
  },
]);
```

- [ ] **Step 5: Add `ThemeToggle` to `components/shared/Navbar.tsx`** next to the existing right-side actions (import it, render `<ThemeToggle />` in the flex row that holds login/profile controls).

- [ ] **Step 6: Verify**

Run: `npm run typecheck --workspace @jobportal/web && npm run dev:web`
Manually: toggle theme (class flips on `<html>`, colours change), navigate `/` → `/admin/companies` and confirm `data-portal` flips seeker → recruiter in devtools.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): mount ThemeProvider, ThemeToggle and route-driven PortalScope"
```

---

### Task 3: Motion composables

**Files:**
- Create: `frontend/src/lib/motion.tsx`

**Interfaces:**
- Produces: `FadeIn` (props: `children`, `className?`, `delay?: number`), `StaggerList` (props: `children`, `className?`) + `StaggerItem` (props: `children`, `className?`), `HoverLift` (props: `children`, `className?`), `SharedElement` (props: `children`, `layoutId: string`, `className?`). All no-op under reduced motion.

- [ ] **Step 1: Create `lib/motion.tsx`**

```tsx
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

// Mirrors --ease-out-quint / --dur-* from index.css. framer-motion takes
// seconds and a bezier array, so the CSS custom properties can't be read
// directly; keep these in sync with index.css.
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
export const DUR_FAST = 0.12;
export const DUR_BASE = 0.2;
export const DUR_SLOW = 0.38;

type MotionChildren = { children: ReactNode; className?: string };

export function FadeIn({ children, className, delay = 0 }: MotionChildren & { delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_SLOW, ease: EASE_OUT_QUINT, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DUR_BASE, ease: EASE_OUT_QUINT } },
};

export function StaggerList({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

export function HoverLift({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      transition={{ duration: DUR_FAST, ease: EASE_OUT_QUINT }}
    >
      {children}
    </motion.div>
  );
}

export function SharedElement({ children, layoutId, className }: MotionChildren & { layoutId: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} layoutId={layoutId} transition={{ duration: DUR_BASE, ease: EASE_OUT_QUINT }}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify** `npm run typecheck --workspace @jobportal/web` passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/motion.tsx
git commit -m "feat(web): motion composables with reduced-motion short-circuit"
```

---

### Task 4: Rebuild the 12 existing primitives onto tokens

**Files:**
- Modify: `frontend/src/components/ui/avatar.tsx`, `badge.tsx`, `button.tsx`, `carousel.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `popover.tsx`, `radio-group.tsx`, `select.tsx`, `sonner.tsx`, `table.tsx`

**Interfaces:**
- Consumes: token utilities from Task 1.
- Produces: same exported component names and props as today (call sites keep compiling), but every class string is token-only. `Button` gains variant `signal`; `Badge` gains variants `signal`, `ok`, `warn`, `danger`.

Rules applied to every file: replace `bg-primary`→`bg-ink`, `text-primary-foreground`→`text-paper`, `bg-background`→`bg-paper`, `bg-popover`→`bg-paper-raised`, `text-muted-foreground`→`text-ink-muted`, `border-input`/`border-border`→`border-line`, `ring-ring/50`→`ring-signal-ring`, `bg-accent`→`bg-signal-muted`, `rounded-md`→`rounded-sharp`, `rounded-lg`/`rounded-xl`→`rounded-surface`, all `dark:` colour overrides deleted (tokens flip themselves).

- [ ] **Step 1: `button.tsx`** — replace `buttonVariants` with:

```tsx
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sharp text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-danger/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/90",
        signal: "bg-signal-text text-signal-fg hover:bg-signal-text/90",
        destructive: "bg-danger text-danger-fg hover:bg-danger/90",
        outline: "border border-line bg-paper hover:bg-paper-sunken",
        secondary: "bg-paper-sunken text-ink hover:bg-paper-sunken/70",
        ghost: "hover:bg-signal-muted",
        link: "text-signal-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

- [ ] **Step 2: `badge.tsx`** — variants become:

```tsx
{
  default: "bg-ink text-paper",
  signal: "bg-signal-muted text-signal-text",
  outline: "border border-line text-ink",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
}
```

Base classes: `inline-flex items-center gap-1 rounded-sharp px-2 py-0.5 text-xs font-medium font-mono`. (Semantic badges are always rendered with an icon + label by callers — colour is never the only channel.)

- [ ] **Step 3: `input.tsx`** — class string becomes:

```
"flex h-9 w-full min-w-0 rounded-sharp border border-line bg-paper px-3 py-1 text-base text-ink placeholder:text-ink-muted selection:bg-signal-muted transition-colors duration-(--dur-fast) outline-none focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/30 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium md:text-sm"
```

- [ ] **Step 4: `label.tsx`** — `"flex items-center gap-2 text-sm font-medium text-ink select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"`.

- [ ] **Step 5: `avatar.tsx`** — root `rounded-full`; fallback `"flex size-full items-center justify-center rounded-full bg-paper-sunken text-ink-muted font-mono text-sm"`.

- [ ] **Step 6: `dialog.tsx`** — overlay `"fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"`; content `"fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-surface border border-line bg-paper-raised p-6 shadow-lg duration-(--dur-base)"` (dialog is a true overlay — shadow allowed). Title `"font-display text-lg font-semibold text-ink"`, description `"text-sm text-ink-muted"`. Close button keeps its Radix wiring; classes `"absolute top-4 right-4 rounded-sharp opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-signal-ring outline-none"`.

- [ ] **Step 7: `popover.tsx`** — content `"z-50 w-72 rounded-surface border border-line bg-paper-raised p-4 text-ink shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"`.

- [ ] **Step 8: `select.tsx`** — trigger mirrors input classes (Step 3) plus `"items-center justify-between gap-2 whitespace-nowrap data-[placeholder]:text-ink-muted"`; content `"z-50 max-h-96 min-w-32 overflow-hidden rounded-surface border border-line bg-paper-raised text-ink shadow-md"`; item `"relative flex w-full cursor-default items-center gap-2 rounded-sharp py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-signal-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"`.

- [ ] **Step 9: `radio-group.tsx`** — item `"aspect-square size-4 shrink-0 rounded-full border border-line text-signal outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-signal"`; indicator icon `"fill-signal"` (indicator = non-text signal use).

- [ ] **Step 10: `table.tsx`** — wrapper unchanged; table `"w-full caption-bottom text-sm"`; header row `"border-b border-line"`; head cell `"h-10 px-2 text-left align-middle text-xs font-medium text-ink-muted uppercase tracking-wide"`; row `"border-b border-line transition-colors duration-(--dur-fast) hover:bg-paper-sunken data-[state=selected]:bg-signal-muted"`; cell `"p-2 align-middle"`. Numeric/data cells at call sites use `font-mono` (2B concern; the primitive just must not fight it).

- [ ] **Step 11: `sonner.tsx`** — keep `useTheme()` (now functional since Task 2); style prop maps sonner vars to tokens:

```tsx
style={{
  "--normal-bg": "var(--paper-raised)",
  "--normal-text": "var(--ink)",
  "--normal-border": "var(--line)",
} as React.CSSProperties}
```

- [ ] **Step 12: `carousel.tsx`** — buttons already render `Button` variants; replace any literal colour classes with `border-line` / `bg-paper` equivalents; no structural change.

- [ ] **Step 13: Verify**

Run: `npm run typecheck --workspace @jobportal/web && npm run lint --workspace @jobportal/web && npm run build --workspace @jobportal/web`
Expected: pass. Then `grep -rEn 'bg-primary|text-primary|bg-background|bg-accent|text-muted-foreground|border-input' frontend/src/components/ui` — expect no hits.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(web): rebuild 12 primitives on Ink & Signal tokens"
```

---

### Task 5: Add 8 new primitives

**Files:**
- Create: `frontend/src/components/ui/card.tsx`, `tabs.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `skeleton.tsx`, `separator.tsx`, `sheet.tsx`, `pagination.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`, Radix from the `radix-ui` umbrella package (`import { Tabs as TabsPrimitive } from "radix-ui"` style — matches `button.tsx`'s existing `import { Slot } from "radix-ui"`).
- Produces: `Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`; `Tabs, TabsList, TabsTrigger, TabsContent`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel`; `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`; `Skeleton`; `Separator`; `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose`; `Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis`.

- [ ] **Step 1: `card.tsx`** (no Radix needed)

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-surface border border-line bg-paper-raised text-ink", className)}
      {...props}
    />
  )
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
}
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-display text-lg font-semibold", className)} {...props} />
}
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-ink-muted", className)} {...props} />
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />
}
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
```

- [ ] **Step 2: `tabs.tsx`** — wrap `TabsPrimitive` from `radix-ui`. List `"inline-flex h-9 items-center gap-1 rounded-sharp bg-paper-sunken p-1 text-ink-muted"`; trigger `"inline-flex items-center justify-center rounded-sharp px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-paper-raised data-[state=active]:text-ink"`; content `"mt-2 outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring"`.

- [ ] **Step 3: `dropdown-menu.tsx`** — wrap `DropdownMenu` from `radix-ui`. Content (true overlay → shadow allowed): `"z-50 min-w-32 overflow-hidden rounded-surface border border-line bg-paper-raised p-1 text-ink shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"`; item `"relative flex cursor-default items-center gap-2 rounded-sharp px-2 py-1.5 text-sm outline-none select-none focus:bg-signal-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"`; separator `"-mx-1 my-1 h-px bg-line"`; label `"px-2 py-1.5 text-xs font-medium text-ink-muted"`. Render content inside `DropdownMenuPrimitive.Portal`.

- [ ] **Step 4: `tooltip.tsx`** — wrap `Tooltip` from `radix-ui`. Content `"z-50 rounded-sharp bg-ink px-3 py-1.5 text-xs text-paper animate-in fade-in-0 zoom-in-95"`, `sideOffset={4}`, in a Portal. Export `TooltipProvider` re-exporting `TooltipPrimitive.Provider` with `delayDuration={200}` default.

- [ ] **Step 5: `skeleton.tsx`**

```tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-sharp bg-paper-sunken motion-reduce:animate-none", className)}
      {...props}
    />
  )
}
export { Skeleton }
```

- [ ] **Step 6: `separator.tsx`** — wrap `Separator` from `radix-ui`; `"shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px"`, `decorative` default true.

- [ ] **Step 7: `sheet.tsx`** — wrap `Dialog` from `radix-ui` (a sheet is a side-anchored dialog). Overlay as dialog's; content CVA on `side` (`right` default): base `"fixed z-50 flex flex-col gap-4 bg-paper-raised p-6 shadow-lg transition ease-(--ease-out-quint) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-base) data-[state=open]:duration-(--dur-slow)"`; side variants `right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-line data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"` and mirrored `left`/`top`/`bottom`. Header/Title/Description mirror dialog's classes.

- [ ] **Step 8: `pagination.tsx`** — nav/ul/li structure, no Radix. `PaginationLink` renders `<a>` with `buttonVariants({ variant: isActive ? "outline" : "ghost", size: "icon" })` plus `aria-current={isActive ? "page" : undefined}` and `data-[active=true]:border-signal` (border = non-text signal use); numbers get `font-mono`. `PaginationPrevious`/`PaginationNext` use size `default` with `ChevronLeft`/`ChevronRight` from lucide and visible labels; `PaginationEllipsis` renders `MoreHorizontal` icon with `sr-only` "More pages".

- [ ] **Step 9: Verify** `npm run typecheck --workspace @jobportal/web && npm run lint --workspace @jobportal/web` pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(web): add card, tabs, dropdown-menu, tooltip, skeleton, separator, sheet, pagination primitives"
```

---

### Task 6: Gallery route `/_design`

**Files:**
- Create: `frontend/src/components/design/DesignGallery.tsx`
- Modify: `frontend/src/App.tsx` (conditional route)

**Interfaces:**
- Consumes: every primitive from Tasks 4–5, `FadeIn`/`StaggerList`/`StaggerItem`/`HoverLift` from Task 3, `ThemeToggle` from Task 2.
- Produces: default-exported `DesignGallery` component (default export required for `React.lazy`).

- [ ] **Step 1: Create `DesignGallery.tsx`.** Structure — a page that renders four full copies of the same `<GallerySection />` grid: (light seeker), (light recruiter), (dark seeker), (dark recruiter). Light/dark is simulated per-block by wrapping two of them in `<div className="dark">` (the `dark` custom variant matches `.dark *`, so a scoped wrapper works without touching the global theme); portal is set with `data-portal` wrappers:

```tsx
export default function DesignGallery() {
  return (
    <div className="min-h-screen bg-paper p-8 space-y-12">
      <h1 className="font-display text-display-md">Ink &amp; Signal — design gallery</h1>
      {(["seeker", "recruiter"] as const).map((portal) => (
        <div key={portal} data-portal={portal} className="space-y-8">
          <h2 className="font-mono text-sm uppercase tracking-wide text-ink-muted">portal: {portal}</h2>
          <div className="bg-paper p-6 rounded-surface border border-line">
            <GallerySection theme="light" />
          </div>
          <div className="dark">
            <div className="bg-paper text-ink p-6 rounded-surface border border-line">
              <GallerySection theme="dark" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

`GallerySection` renders, in order: **token swatches** (each of paper/paper-sunken/paper-raised/ink/ink-muted/line/signal/signal-text/signal-muted/danger/warn/ok as a labelled `size-16` square), **type ramp** (each `--text-*` size in its face, display sizes in Fraunces, a mono metadata line), **every Button variant × size**, **every Badge variant** (semantic ones with lucide icons + labels: `CircleCheck` ok, `TriangleAlert` warn, `CircleX` danger), **Input** (idle/disabled/aria-invalid), **Label**, **Avatar** (image + fallback), **RadioGroup**, **Select**, **Dialog** (trigger + content), **Popover**, **Tooltip**, **DropdownMenu**, **Tabs**, **Table** (3 rows, mono data cells), **Card** (with `HoverLift`), **Skeleton**, **Separator**, **Sheet** (trigger), **Pagination** (pages 1–3 with active state), **Carousel** (3 slides), a **sonner** trigger button, and a `StaggerList` of three `FadeIn` cards to exercise motion.

- [ ] **Step 2: Mount DEV-only in `App.tsx`** using `React.lazy` so the module stays out of the production graph:

```tsx
const DesignGallery = import.meta.env.DEV
  ? lazy(() => import("./components/design/DesignGallery"))
  : null;

// inside RootLayout children:
...(import.meta.env.DEV && DesignGallery
  ? [{ path: "/_design", element: (
      <Suspense fallback={null}><DesignGallery /></Suspense>
    ) }]
  : []),
```

`import.meta.env.DEV` is statically false in production builds, so Rollup drops both the route and the dynamic import.

- [ ] **Step 3: Verify absence from dist**

```bash
npm run build --workspace @jobportal/web
grep -rl "design gallery" frontend/dist && echo "LEAKED" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Visual review** — `npm run dev:web`, open `/_design`, check all four theme × portal blocks, toggle OS reduced-motion and confirm composables are static.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): /_design gallery route, DEV-only"
```

---

### Task 7: Hardcoded colour purge

**Files (all Modify, colour classes only — no layout/logic change):**
- `frontend/src/components/shared/Navbar.tsx:43,77`
- `frontend/src/components/HeroSection.tsx:20,25,38`
- `frontend/src/components/Job.tsx:51,54,57,65`
- `frontend/src/components/JobDescription.tsx:88,91,94,103`
- `frontend/src/components/LatestJobCards.tsx:26,29,32`
- `frontend/src/components/LatestJobs.tsx:10`
- `frontend/src/components/Profile.tsx:99`
- `frontend/src/components/AppliedJobTable.tsx:43,46`
- `frontend/src/components/admin/ApplicantsTable.tsx:60`
- `frontend/src/components/admin/PostJob.tsx:182`
- `frontend/src/components/auth/AuthError.tsx:24`, `ConfirmGoogleLink.tsx:46,56`, `LinkPending.tsx:21`, `Login.tsx:124,155`, `Signup.tsx:153`, `VerifyEmail.tsx:98`

**Interfaces:** none — mechanical substitution.

- [ ] **Step 1: Apply this substitution table** at every site found by the exit grep (line numbers above are pre-change anchors; re-grep to locate exactly):

| Old | New |
|---|---|
| `text-[#F83002]`, `text-[#6A38C2]`, `text-[#7209b7]` | `text-signal-text` |
| `bg-[#6A38C2]`, `bg-[#7209b7]` (button fills) | `bg-signal-text text-signal-fg` (or switch the element to `<Button variant="signal">`) |
| `hover:bg-[#5f32ad]`, `hover:bg-[#5b30a6]` | `hover:bg-signal-text/90` |
| `text-blue-600`, `text-blue-700` | `text-signal-text` |
| `text-red-600` (error copy) | `text-danger` |
| `bg-red-400` (rejected badge) | `bg-danger/15 text-danger` (or `<Badge variant="danger">`) |
| `bg-green-400` (accepted badge) | `bg-ok/15 text-ok` (or `<Badge variant="ok">`) |
| status dots / rings in `#F83002` | `bg-signal` (non-text) or `text-danger` if it marks an error |

Where a rejected/accepted status is shown, ensure the label text is present (it is — these are text badges), satisfying icon-and-label; add a lucide `CircleCheck`/`CircleX` icon where the badge component variant is adopted.

- [ ] **Step 2: Run the exit grep**

```bash
grep -rE '(bg|text|border)-\[#|(bg|text|border)-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan)-[0-9]' frontend/src
```

Expected: no output.

- [ ] **Step 3: Verify** `npm run typecheck --workspace @jobportal/web && npm run lint --workspace @jobportal/web && npm run build --workspace @jobportal/web` pass; spot-check `/`, `/jobs`, `/login`, `/admin/companies` in the dev server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): purge hardcoded colours — all surfaces read Ink & Signal tokens"
```

---

### Task 8: Full verification and close-out

**Files:**
- Modify: `CLAUDE.md` (Current state section: record 2A as built)

- [ ] **Step 1: Full CI** — `npm run ci` from the root. Expected: green (196 backend + 11 shared tests, both typechecks, both builds).

- [ ] **Step 2: Re-run the dist-absence check** from Task 6 Step 3 and the exit grep from Task 7 Step 2.

- [ ] **Step 3: Contrast audit** — for each pairing check with an OKLCH contrast tool (or `npx apca-w3` / manual conversion): `--ink`/`--paper`, `--ink-muted`/`--paper`, `--signal-text`/`--paper`, `--signal-fg`/`--signal-text`, `--danger`/`--paper`, `--warn`/`--paper`, `--ok`/`--paper` — both themes, both portals. Target: ≥4.5:1 body, ≥3:1 large. If any pairing misses, adjust the token's lightness (not the component) and re-check.

- [ ] **Step 4: Update `CLAUDE.md`** — move Phase 2A into the completed list with one line per exit criterion met.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "docs: record phase 2A as built"
git push origin main
```
