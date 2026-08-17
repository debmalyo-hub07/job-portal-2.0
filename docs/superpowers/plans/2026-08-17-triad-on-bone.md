# Triad on Bone — Colour System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the colour system as a warm "bone" house with a strict triadic portal harmony (teal 200° / gold 80° / rose 320°), a coherent dark theme, and a role-layered token structure that enforces the 60/30/10 ratio and a 4.5:1-text + 3:1-UI contrast floor.

**Architecture:** One file (`frontend/src/index.css`) carries three token tiers — palette (hue constants + per-portal OKLCH ramps), semantics (surfaces/ink/line/media/status, flipped by `.dark`), and roles (the 60/30/10 contract + interaction states, flipped by `data-portal`). Components consume roles, never hues. Two CI gates protect it: `lint:colour` (no raw colour, hue-wander, hue-separation) and `tests/visual/contrast.mjs` (live-resolved WCAG ratios in a real browser).

**Tech Stack:** CSS custom properties + OKLCH, Tailwind 4 `@theme inline`, Playwright (contrast probe), a Node grep gate.

**Spec:** `docs/superpowers/specs/2026-08-17-triad-on-bone-color-system-design.md` — read it first; this plan argues from it.

## Global Constraints

- **All values in OKLCH.** Every colour literal in `index.css` is an `oklch(...)`; no hex, `rgb()`, or `hsl()`.
- **No relative colour syntax.** Never `oklch(from …)` — the atmosphere shader's `parseOklch` (and `tests/oklch.test.ts`) only parse literal `oklch(L C H / A)`. A relative colour returns `null` and silently kills the ambient field.
- **Hue-wander ±2°.** Every literal hue inside a portal block must stay within ±2° of that portal's anchor (seeker 200, recruiter 80, admin 320). Only lightness/chroma vary along a ramp. Where a portal needs the house ink (e.g. gold's `--signal-fg`, all `--container-ink`), reference `var(--ink)` rather than writing a hue-70 literal inside the portal block.
- **Chroma cap on neutrals.** House surfaces and ink keep chroma ≤ 0.012 so the ground reads warm, never yellow.
- **No raw colour outside `index.css`.** Components use token utilities only. The one sanctioned exception is `frontend/src/lib/atmosphere/oklch.ts` (the parser contains `oklch(` in its own regex/strings).
- **Status hues:** danger 25°, warn **65°** (moved off 75° to clear gold), ok 145°. Status separation from every portal anchor must stay ≥ 15°.
- **Contrast floors:** all text pairings ≥ 4.5:1; UI components (control boundaries, focus rings) ≥ 3:1. `ink-faint` is captions/decorative only and floors at 3:1 — essential text uses `ink-muted`.
- **Components never branch on theme.** A `dark:` colour override in a component is a bug; tokens flip themselves.
- **Commit messages:** imperative, no `Co-Authored-By` trailer (repo convention).
- **Verification order:** `npm run lint:colour`, then `npm test`, then (with a dev server) `npm run test:visual --workspace @jobportal/web`.

---

## Task 1: Rewrite the token tiers in `index.css`

**Files:**
- Modify: `frontend/src/index.css` (the `@theme inline` block, the `:root` light block, the `.dark` block, and the six portal blocks)
- Test: existing `frontend/tests/oklch.test.ts` (parses every oklch token), `frontend/scripts/check-colour-tokens.mjs`, and the live `contrast.mjs` probe

**Interfaces:**
- Produces the tokens every later task consumes: `--paper`, `--paper-sunken`, `--paper-raised`, `--overlay`, `--ink`, `--ink-muted`, `--ink-faint`, `--line`, `--line-strong`, `--media-shade`, `--media-copy`, `--media-surface`, `--media-surface-ink`, `--logo-canvas`; per-portal `--signal`, `--signal-hover`, `--signal-pressed`, `--signal-text`, `--signal-fg`, `--signal-muted`, `--signal-ring`, `--container`, `--container-ink`; status `--danger(-fg)`, `--warn(-fg)`, `--ok(-fg)`.

- [ ] **Step 1: Replace the `@theme inline` block**

Replace the entire `@theme inline { … }` block (currently ending at the `--text-display-xl` line) with this, which adds the new role tokens and re-points the shadcn aliases:

```css
@theme inline {
  /* surfaces & ink */
  --color-paper: var(--paper);
  --color-paper-sunken: var(--paper-sunken);
  --color-paper-raised: var(--paper-raised);
  --color-overlay: var(--overlay);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-faint: var(--ink-faint);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-media-shade: var(--media-shade);
  --color-media-copy: var(--media-copy);
  --color-media-surface: var(--media-surface);
  --color-media-surface-ink: var(--media-surface-ink);
  --color-logo-canvas: var(--logo-canvas);

  /* signal (portal-scoped) — the 10% */
  --color-signal: var(--signal);
  --color-signal-text: var(--signal-text);
  --color-signal-fg: var(--signal-fg);
  --color-signal-muted: var(--signal-muted);
  --color-signal-ring: var(--signal-ring);
  --color-signal-hover: var(--signal-hover);
  --color-signal-pressed: var(--signal-pressed);

  /* structure — the 30% band (portal-scoped) */
  --color-container: var(--container);
  --color-container-ink: var(--container-ink);

  /* semantics — hues 25 / 65 / 145 */
  --color-danger: var(--danger);
  --color-danger-fg: var(--danger-fg);
  --color-warn: var(--warn);
  --color-warn-fg: var(--warn-fg);
  --color-ok: var(--ok);
  --color-ok-fg: var(--ok-fg);

  /* shadcn-compat aliases, re-pointed onto roles */
  --color-background: var(--paper);
  --color-foreground: var(--ink);
  --color-card: var(--paper-raised);
  --color-card-foreground: var(--ink);
  --color-popover: var(--overlay);
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
  --color-input: var(--line-strong);
  --color-ring: var(--signal-ring);

  /* radius — a contrast, not a constant */
  --radius-sharp: 6px;
  --radius-surface: 8px;
  --radius-sm: 6px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 8px;

  /* type */
  --font-display: "Fraunces Variable", Georgia, "Times New Roman", serif;
  --font-sans: "Geist Variable", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", "Cascadia Mono", Consolas, monospace;

  /* type scale — 1.2 ratio at UI sizes, 1.333 at display sizes */
  --text-xs: 0.694rem;
  --text-sm: 0.833rem;
  --text-base: 1rem;
  --text-lg: 1.2rem;
  --text-xl: 1.44rem;
  --text-display-sm: 1.75rem;
  --text-display-md: 2.25rem;
  --text-display-lg: 3.5rem;
  --text-display-xl: 4.75rem;
}
```

- [ ] **Step 2: Replace the `:root` light-token block**

Replace the `:root { /* Ink & Signal light … */ }` block (the one that sets `--paper`, semantics, motion and hero vars — NOT the earlier `:root` motion/density blocks) with:

```css
:root {
  /* Triad on Bone light — warm bone (hue 70), chroma capped so it reads warm,
     never yellow. Elevation is a lightness step: paper < raised < overlay. */
  --paper: oklch(0.985 0.006 70);
  --paper-sunken: oklch(0.94 0.010 70);
  --paper-raised: oklch(0.997 0.004 70);
  --overlay: oklch(0.999 0.002 70);
  --ink: oklch(0.20 0.012 70);
  --ink-muted: oklch(0.43 0.015 70);
  --ink-faint: oklch(0.56 0.012 70);
  --line: oklch(0.20 0.012 70 / 8%);
  --line-strong: oklch(0.60 0.012 70);
  --media-shade: oklch(0.14 0.012 70);
  --media-copy: oklch(0.99 0.003 70);
  --media-surface: oklch(0.995 0.002 70);
  --media-surface-ink: oklch(0.17 0.006 70);
  /* Uploaded marks keep their authored white ground in both themes. */
  --logo-canvas: oklch(0.995 0 0);

  /* semantics: danger 25 / warn 65 / ok 145 — icon + label always */
  --danger: oklch(0.54 0.20 25);
  --danger-fg: oklch(0.99 0.004 25);
  --warn: oklch(0.55 0.15 65);
  --warn-fg: oklch(0.16 0.008 65);
  --ok: oklch(0.50 0.15 145);
  --ok-fg: oklch(0.99 0.004 145);

  /* motion */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 380ms;

  /* Photography stays legible in both themes. */
  --hero-image-brightness: 0.88;
  --hero-image-saturation: 0.90;
  --hero-image-contrast: 1.05;
  --hero-wash-opacity: 0.50;
}
```

- [ ] **Step 3: Replace the `.dark` block**

Replace the existing `.dark { … }` block with the deep-warm-charcoal theme — same hue family as light, elevation by lightness steps, no pure white, no near-black wells:

```css
.dark {
  /* Deep warm charcoal — the same product in a different register. Hue family
     matches light (~70); elevation rises in lightness, never to white. */
  --paper: oklch(0.19 0.010 70);
  --paper-sunken: oklch(0.145 0.008 70);
  --paper-raised: oklch(0.235 0.012 70);
  --overlay: oklch(0.27 0.012 70);
  --ink: oklch(0.93 0.010 80);
  --ink-muted: oklch(0.70 0.012 75);
  --ink-faint: oklch(0.52 0.012 75);
  --line: oklch(0.93 0.010 80 / 12%);
  --line-strong: oklch(0.55 0.012 75);
  --media-shade: oklch(0.10 0.008 70);
  --media-copy: oklch(0.96 0.008 75);
  --media-surface: oklch(0.96 0.008 75);
  --media-surface-ink: oklch(0.20 0.012 70);
  --logo-canvas: oklch(0.995 0 0);

  --danger: oklch(0.68 0.17 25);
  --danger-fg: oklch(0.165 0.006 70);
  --warn: oklch(0.75 0.13 65);
  --warn-fg: oklch(0.165 0.006 70);
  --ok: oklch(0.7 0.13 145);
  --ok-fg: oklch(0.165 0.006 70);

  --hero-image-brightness: 0.7;
  --hero-image-saturation: 0.82;
  --hero-image-contrast: 1.1;
  --hero-wash-opacity: 0.68;
}
```

- [ ] **Step 4: Replace the six portal blocks with the triadic ramps**

Replace the `:root, [data-portal="seeker"] { … }` block and the five blocks after it (recruiter, admin, and the three `.dark` portal blocks) with these. Each ramp derives from its anchor by fixed lightness/chroma deltas; hue never moves. Gold's `--signal-fg` and every `--container-ink` reference `var(--ink)` (not a hue-70 literal) so the hue-wander gate stays clean.

```css
/* Signal — portal scoped, set only from the route. Default = seeker.
   Triad: seeker teal 200, recruiter gold 80, admin rose 320 (120° apart). */
:root,
[data-portal="seeker"] {
  --signal: oklch(0.55 0.13 200);
  --signal-hover: oklch(0.51 0.13 200);
  --signal-pressed: oklch(0.47 0.13 200);
  --signal-text: oklch(0.40 0.11 200);
  --signal-fg: oklch(0.99 0.004 200);
  --signal-muted: oklch(0.55 0.13 200 / 10%);
  --signal-ring: oklch(0.55 0.13 200);
  --container: oklch(0.85 0.033 200);
  --container-ink: var(--ink);
}
[data-portal="recruiter"] {
  --signal: oklch(0.62 0.15 80);
  --signal-hover: oklch(0.58 0.15 80);
  --signal-pressed: oklch(0.54 0.15 80);
  --signal-text: oklch(0.47 0.128 80);
  --signal-fg: var(--ink);
  --signal-muted: oklch(0.62 0.15 80 / 10%);
  --signal-ring: oklch(0.62 0.15 80);
  --container: oklch(0.92 0.038 80);
  --container-ink: var(--ink);
}
[data-portal="admin"] {
  --signal: oklch(0.55 0.18 320);
  --signal-hover: oklch(0.51 0.18 320);
  --signal-pressed: oklch(0.47 0.18 320);
  --signal-text: oklch(0.40 0.153 320);
  --signal-fg: oklch(0.99 0.004 320);
  --signal-muted: oklch(0.55 0.18 320 / 10%);
  --signal-ring: oklch(0.55 0.18 320);
  --container: oklch(0.85 0.045 320);
  --container-ink: var(--ink);
}
.dark,
.dark [data-portal="seeker"] {
  --signal: oklch(0.72 0.11 200);
  --signal-hover: oklch(0.69 0.11 200);
  --signal-pressed: oklch(0.66 0.11 200);
  --signal-text: oklch(0.89 0.11 200);
  --signal-fg: var(--ink);
  --signal-muted: oklch(0.72 0.11 200 / 18%);
  --signal-ring: oklch(0.72 0.11 200);
  --container: oklch(0.25 0.033 200);
  --container-ink: var(--ink);
}
.dark [data-portal="recruiter"] {
  --signal: oklch(0.79 0.128 80);
  --signal-hover: oklch(0.76 0.128 80);
  --signal-pressed: oklch(0.73 0.128 80);
  --signal-text: oklch(0.87 0.105 80);
  --signal-fg: var(--ink);
  --signal-muted: oklch(0.79 0.128 80 / 18%);
  --signal-ring: oklch(0.79 0.128 80);
  --container: oklch(0.32 0.038 80);
  --container-ink: var(--ink);
}
.dark [data-portal="admin"] {
  --signal: oklch(0.72 0.153 320);
  --signal-hover: oklch(0.69 0.153 320);
  --signal-pressed: oklch(0.66 0.153 320);
  --signal-text: oklch(0.89 0.153 320);
  --signal-fg: var(--ink);
  --signal-muted: oklch(0.72 0.153 320 / 18%);
  --signal-ring: oklch(0.72 0.153 320);
  --container: oklch(0.25 0.045 320);
  --container-ink: var(--ink);
}
```

- [ ] **Step 5: Run the colour gate and the oklch parser test**

Run: `npm run lint:colour --workspace @jobportal/web`
Expected: PASS (no non-token colours; all literals still live in `index.css`).

Run: `npx vitest run oklch --workspace @jobportal/web` (or `npm test --workspace @jobportal/web -- oklch`)
Expected: PASS. The "parses every oklch token in index.css" test now reads the new tokens and confirms `parseOklch` accepts each literal (no relative syntax was introduced).

- [ ] **Step 6: Run the full frontend test suite**

Run: `npm test --workspace @jobportal/web`
Expected: PASS. No test asserts palette values; `workspace.test.tsx` only mentions contrast in a comment.

- [ ] **Step 7: Verify contrast live (needs a dev server)**

Start the dev server if not running (`npm run dev:web`, port 5173). Then:
Run: `npm run test:visual --workspace @jobportal/web` is the screenshot harness; for contrast specifically run `node frontend/tests/visual/contrast.mjs`.
Expected: all existing pairings still clear 4.5:1 (new values were chosen to). Record the output; Task 2 extends this probe.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): triad on bone — warm house, triadic portals, rebuilt dark"
```

---

## Task 2: Strengthen the enforcement gates

**Files:**
- Modify: `frontend/tests/visual/contrast.mjs` (add 3:1 UI floor, container/overlay checks, per-check floors)
- Modify: `frontend/scripts/check-colour-tokens.mjs` (add no-raw-oklch-outside-index.css, hue-wander, hue-separation rules)

**Interfaces:**
- Consumes: the tokens from Task 1 (`--line-strong`, `--container`, `--container-ink`, `--overlay`, `--signal-ring`, `--signal-fg`).
- Produces: a contrast probe that reports per-check floors, and a colour gate that fails on hue wander or a status/portal hue collision.

- [ ] **Step 1: Extend `contrast.mjs` with the new checks and per-check floors**

In the per-portal loop, after resolving `paper`, `raised`, `ink`, `inkMuted`, `signalText`, `signalForeground`, also resolve the new tokens and push the new checks. Replace the `checks.push(...)` block inside `for (const portal of portals)` with:

```js
      const signal = resolve("--signal");
      const containerBg = resolve("--container");
      const containerInk = resolve("--container-ink");
      const overlayBg = resolve("--overlay");
      const lineStrong = resolve("--line-strong");

      checks.push(
        { label: `${theme} ${portal}: ink on paper`, ratio: ratio(ink, paper) },
        { label: `${theme} ${portal}: muted ink on paper`, ratio: ratio(inkMuted, paper) },
        { label: `${theme} ${portal}: signal text on paper`, ratio: ratio(signalText, paper) },
        { label: `${theme} ${portal}: signal fg on signal`, ratio: ratio(signalForeground, signal) },
        { label: `${theme} ${portal}: ink on raised surface`, ratio: ratio(ink, raised) },
        { label: `${theme} ${portal}: muted ink on signal panel`, ratio: ratio(inkMuted, mutedPanel, paper) },
        { label: `${theme} ${portal}: container ink on container`, ratio: ratio(containerInk, containerBg) },
        { label: `${theme} ${portal}: signal text on container`, ratio: ratio(signalText, containerBg) },
        { label: `${theme} ${portal}: ink on overlay`, ratio: ratio(ink, overlayBg) },
        { label: `${theme} ${portal}: line-strong on paper (UI 3:1)`, ratio: ratio(lineStrong, paper), floor: 3 },
        { label: `${theme} ${portal}: signal ring on paper (UI 3:1)`, ratio: ratio(signal, paper), floor: 3 },
      );
```

Then update the final reporting loop to honour each check's floor:

```js
let failed = 0;
for (const result of results) {
  const floor = result.floor ?? 4.5;
  const passes = result.ratio >= floor;
  if (!passes) failed++;
  console.log(`${passes ? "PASS" : "FAIL"}  ${String(result.ratio).padStart(6)}:1  (floor ${floor})  ${result.label}`);
}
console.log(`\n${results.length - failed}/${results.length} pairings clear their floor`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the no-raw-oklch rule to `check-colour-tokens.mjs`**

Inside the `for (const file of walk(SRC))` loop, before the existing `lines.forEach`, add a guard that rejects a literal `oklch(` anywhere except `index.css` and the atmosphere parser:

```js
  const rel = path.relative(SRC, file);
  const isTokenSource = rel === "index.css";
  const isOklchParser = rel.replace(/\\/g, "/") === "lib/atmosphere/oklch.ts";
```

Then within `lines.forEach`, before the pattern loop, add:

```js
    if (!isTokenSource && !isOklchParser && /oklch\(/.test(line)) {
      console.log(`${rel}:${i + 1}  raw oklch( outside the token source`);
      hits++;
      return;
    }
```

- [ ] **Step 3: Add the hue-wander and hue-separation rules**

Append to `check-colour-tokens.mjs`, after the file-walk loop and before the final `if (hits > 0)` exit, a block that reads `index.css` and audits the harmony:

```js
// Harmony audit: portal hues must not wander from their anchor, and status
// hues must stay clear of every portal anchor. This is the difference between
// a palette and five colours that happened.
const css = readFileSync(path.resolve(SRC, "index.css"), "utf8");
const ANCHORS = { seeker: 200, recruiter: 80, admin: 320 };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const hueOf = (oklch) => {
  const m = /oklch\(\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)/.exec(oklch);
  return m ? Number(m[1]) : null;
};

function huesForPortal(portal) {
  const re = new RegExp(`\\[data-portal="${portal}"\\][^{}]*\\{([^}]*)\\}`, "g");
  const hues = [];
  let m;
  while ((m = re.exec(css)) !== null) {
    for (const hit of m[1].matchAll(/oklch\([^)]*\)/g)) {
      const h = hueOf(hit[0]);
      if (h !== null) hues.push(h);
    }
  }
  return hues;
}

for (const [portal, anchor] of Object.entries(ANCHORS)) {
  for (const h of huesForPortal(portal)) {
    if (hueDist(h, anchor) > 2) {
      console.log(`index.css: ${portal} hue wandered to ${h} (anchor ${anchor})`);
      hits++;
    }
  }
}

const statusHues = {};
for (const name of ["danger", "warn", "ok"]) {
  const m = new RegExp(`--${name}:\\s*oklch\\([^)]*\\)`).exec(css);
  if (m) statusHues[name] = hueOf(m[0].match(/oklch\([^)]*\)/)[0]);
}
for (const [portal, anchor] of Object.entries(ANCHORS)) {
  for (const [name, h] of Object.entries(statusHues)) {
    if (h !== null && hueDist(h, anchor) < 15) {
      console.log(`index.css: ${name} hue ${h} sits within 15° of ${portal} anchor ${anchor}`);
      hits++;
    }
  }
}
```

- [ ] **Step 4: Run the colour gate**

Run: `npm run lint:colour --workspace @jobportal/web`
Expected: PASS. The Task 1 palette is triadic by construction, so hue-wander and separation both hold; no component contains a raw `oklch(`.

- [ ] **Step 5: Run the contrast probe**

With the dev server running:
Run: `node frontend/tests/visual/contrast.mjs`
Expected: every pairing clears its floor (4.5:1 text, 3:1 UI). If a gold or container pairing is marginal, adjust the offending anchor/ramp value in `index.css` within the spec's ±0.01 L tolerance and re-run — do NOT lower a floor.

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/visual/contrast.mjs frontend/scripts/check-colour-tokens.mjs frontend/src/index.css
git commit -m "test(theme): enforce 3:1 UI floor, hue wander, and hue separation"
```

---

## Task 3: Apply the interaction contract to the primitives

**Files:**
- Modify: `frontend/src/components/ui/button.tsx`
- Modify: `frontend/src/components/ui/badge.tsx`
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/tabs.tsx`
- Modify: `frontend/src/components/ui/select.tsx`
- Modify: `frontend/src/components/ui/radio-group.tsx`

**Interfaces:**
- Consumes: `--signal-hover`, `--signal-pressed`, `--signal-ring`, `--line-strong`, `--container`, `--ink-faint` from Task 1.
- Produces: primitives whose rest/hover/pressed/focus/disabled states come from tokens, so every portal inherits them.

The contract: rest = `signal`; hover = `signal-hover`; pressed = `signal-pressed`; focus = `signal-ring`; disabled = `ink-faint` + `paper-sunken`.

- [ ] **Step 1: Button**

In `button.tsx`, update the `signal`, `outline`, and `ghost` variants to use the interaction tokens:

```tsx
        signal: "bg-signal text-signal-fg shadow-sm hover:bg-signal-hover active:bg-signal-pressed hover:shadow-md",
        outline: "border border-line-strong bg-paper-raised hover:border-ink-muted hover:bg-paper-sunken",
        ghost: "hover:bg-signal-muted active:bg-signal-muted",
```

Leave `default`, `destructive`, `secondary`, `link` unchanged.

- [ ] **Step 2: Badge**

In `badge.tsx`, update the `signal` variant and keep semantic badges icon+label (already the case):

```tsx
        signal: "bg-container text-container-ink",
```

- [ ] **Step 3: Input**

In `input.tsx`, change `border-line` to `border-line-strong` (the 3:1 control boundary) and keep the signal focus ring:

```tsx
        "h-11 w-full min-w-0 rounded-sharp border border-line-strong bg-paper-raised px-3.5 py-2 text-base text-ink transition-[border-color,box-shadow,background-color] duration-(--dur-fast) outline-none selection:bg-signal-muted file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
```

- [ ] **Step 4: Tabs**

In `tabs.tsx`, give the active trigger the container band instead of plain raised:

```tsx
        "inline-flex items-center justify-center gap-1.5 rounded-sharp px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-container data-[state=active]:text-container-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
```

- [ ] **Step 5: Select**

In `select.tsx`, change `SelectTrigger`'s `border-line` to `border-line-strong`, and `SelectItem`'s focus fill to the container band:

```tsx
        "flex w-fit items-center justify-between gap-2 rounded-sharp border border-line-strong bg-paper px-3 py-2 text-sm text-ink whitespace-nowrap transition-colors duration-(--dur-fast) outline-none focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/30 data-[placeholder]:text-ink-muted data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-muted",
```

and

```tsx
        "relative flex w-full cursor-default items-center gap-2 rounded-sharp py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-container focus:text-container-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-muted *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
```

- [ ] **Step 6: RadioGroup**

In `radio-group.tsx`, change the item border to `border-line-strong`:

```tsx
        "aspect-square size-4 shrink-0 rounded-full border border-line-strong text-signal transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/30 data-[state=checked]:border-signal",
```

- [ ] **Step 7: Run lint, tests, and the colour gate**

Run: `npm run lint --workspace @jobportal/web` then `npm test --workspace @jobportal/web` then `npm run lint:colour --workspace @jobportal/web`.
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat(ui): primitives consume the signal interaction contract"
```

---

## Task 4: Wire roles into the chrome and pages

**Files:**
- Modify: `frontend/src/components/shared/Navbar.tsx` (selected state → container; hover captions → ink-faint)
- Modify: `frontend/src/components/Footer.tsx` (captions → ink-faint via media-copy is fine; no change needed unless captions use raw opacity — leave media-copy alphas)
- Modify: `frontend/src/components/auth/PortalPanel.tsx` (captions → ink-faint pattern where on paper)
- Modify: `frontend/src/components/Jobs.tsx`, `frontend/src/components/Profile.tsx`, admin console pages (selected row / active filter → container; section banding → paper-sunken)

**Interfaces:**
- Consumes: `--container`, `--container-ink`, `--ink-faint` from Task 1.
- Produces: per-portal identity in the 30% band and legible selected states.

- [ ] **Step 1: Navbar selected link**

In `Navbar.tsx`, the active desktop `NavLink` currently uses `bg-paper-sunken text-ink`. Change the non-media active branch to the container band so the current page carries the portal's 30% tone:

```tsx
                          "rounded-sharp px-3 py-2",
                          mediaTone ? "bg-media-copy/12 text-media-copy" : "bg-container text-container-ink",
```

And the mobile `NavLink` active branch from `text-signal-text` to the container treatment:

```tsx
                      `rounded-sharp px-2 py-2 text-base hover:bg-signal-muted ${
                        isActive ? "bg-container text-container-ink" : "text-ink"
                      }`
```

- [ ] **Step 2: Caption opacity hacks → ink-faint**

The mandatory change: in `Navbar.tsx`, the account-menu email line is non-essential metadata. Change it from `text-ink-muted` to `text-ink-faint`:

```tsx
                    <p className="truncate text-sm text-ink-faint">{user.email}</p>
```

Rule for any further migration: `ink-faint` is for captions and decorative text only (floors at 3:1). Never move form labels, body copy, or anything the user must read — those stay `ink-muted`. Additional migrations are optional in this task; do not chase them across pages.

- [ ] **Step 3: Selected states in the workspaces**

`frontend/src/components/layout/WorkbenchShell.tsx` is the shared shell for the recruiter and admin workspaces; its sidebar active link is the platform's most visible selected state. Change the active branch from `bg-signal-muted text-ink` to the container band so the current page carries the portal's 30% tone:

```tsx
                          isActive
                            ? "bg-container text-container-ink"
                            : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
```

Also in the same file, the eyebrow above the nav uses `text-signal-text`; keep it — it is the 10% accent and is correct.

For any table rows or filter chips in the admin console or recruiter job list that mark a selected item with `bg-paper-sunken`/`bg-signal-muted`, apply the same `bg-container text-container-ink` treatment.

- [ ] **Step 4: Section banding**

On the jobs board, the filter column should recede so the results read as the figure. In `frontend/src/components/Jobs.tsx`, the desktop filter wrapper (the `<div className="hidden md:block">` holding `<FilterCard idPrefix="desktop-filter" />`) currently renders bare. Give it the recessed band:

```tsx
        <div className="hidden rounded-surface bg-paper-sunken p-4 md:block">
          <FilterCard idPrefix="desktop-filter" />
        </div>
```

- [ ] **Step 5: Logo canvas keeps its deliberate frame**

`frontend/src/components/shared/CompanyAvatar.tsx` renders uploaded marks on `--logo-canvas` (a white ground in both themes). Its wrapper border is `border-line`, which in dark is a faint 12% ink alpha — too quiet to frame a white square deliberately. Raise the wrapper border to `border-line-strong`:

```tsx
      className={cn("rounded-sharp border border-line-strong bg-paper-raised shadow-sm", className)}
```

- [ ] **Step 6: Run lint, tests, and the visual harness**

Run: `npm run lint --workspace @jobportal/web`, `npm test --workspace @jobportal/web`, and with a dev server `npm run test:visual --workspace @jobportal/web`.
Expected: lint + tests PASS. The visual harness will produce new screenshots; review them for the warm house and triadic portals in both themes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ frontend/src/pages/
git commit -m "feat(web): wire the 30% container band and ink-faint captions"
```

---

## Task 5: Gallery + final verification

**Files:**
- Modify: `frontend/src/components/design/DesignGallery.tsx` (add admin portal, new ramp tokens, 60/30/10 audit view)

**Interfaces:**
- Consumes: all tokens from Task 1 and the primitives from Task 3.
- Produces: the DEV-only `/design` gallery rendering all three portals × both themes, with a ramp and a 60/30/10 audit.

- [ ] **Step 1: Add the admin portal and new tokens to the gallery**

In `DesignGallery.tsx`, change `const portals = ["seeker", "recruiter"] as const;` to include `"admin"`. Extend the token swatch list with the new tokens:

```tsx
            { name: "overlay", class: "bg-overlay" },
            { name: "ink-faint", class: "bg-ink-faint" },
            { name: "line-strong", class: "bg-line-strong" },
            { name: "container", class: "bg-container" },
            { name: "signal-hover", class: "bg-signal-hover" },
            { name: "signal-pressed", class: "bg-signal-pressed" },
```

- [ ] **Step 2: Add a 60/30/10 audit section**

Add a gallery section that renders representative 60/30/10 swatches side by side so the ratio is visible, labelled with their target share. Place it after the token swatches:

```tsx
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase text-ink-muted">60 / 30 / 10</h4>
        <div className="flex h-24 w-full overflow-hidden rounded-surface border border-line">
          <div className="flex w-[60%] items-end bg-paper p-2"><span className="font-mono text-xs text-ink-muted">60 surface</span></div>
          <div className="flex w-[30%] items-end bg-container p-2"><span className="font-mono text-xs text-container-ink">30 structure</span></div>
          <div className="flex w-[10%] items-end bg-signal p-2"><span className="font-mono text-xs text-signal-fg">10</span></div>
        </div>
      </section>
```

- [ ] **Step 3: Run the full verification suite**

Run, in order: `npm run lint:colour --workspace @jobportal/web`, `npm test --workspace @jobportal/web`, `npm run typecheck --workspace @jobportal/web`, then with a dev server `node frontend/tests/visual/contrast.mjs` and `npm run test:visual --workspace @jobportal/web`.
Expected: all green. Open `/_design` in the browser and eyeball all three portals in both themes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/design/DesignGallery.tsx
git commit -m "feat(design): gallery gains the admin portal, ramps, and 60/30/10 audit"
```

- [ ] **Step 5: Run the repo-wide CI gate**

Run: `npm run ci`
Expected: PASS end-to-end (typecheck, lint, colour gate, tests, build).
