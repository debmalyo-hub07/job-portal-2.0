# Phase 2A — Ink & Signal Design Foundation (Design)

Date: 2026-08-05. Status: approved by user (Ink & Signal, portal-scoped signal
retained; Node upgrade taken as a prerequisite; frontend test runner deferred to
2B).

## Goal

Replace the inherited template's visual foundation with an intentional design
system, and make the theme layer actually function. Exit criteria: no component
sets a colour outside the token system; dark mode works and is togglable; the 12
existing primitives plus 8 new ones render from tokens only; a gallery route
renders every primitive × variant × theme × portal signal on one page.

This is the foundation slice. Surfaces are rebuilt in 2B (public + seeker) and
2C (recruiter). Nothing from the old visual language is retained.

## Current defects being fixed

- `frontend/src/index.css` is stock shadcn: every semantic colour is
  `oklch(L 0 0)` — zero chroma, no brand.
- ~13 sites hardcode colour past the token system: `#F83002` (×5), `#7209b7`
  (×5), `#6A38C2` (×4), `#5f32ad`, `#5b30a6`, plus `text-blue-600` (×8),
  `text-blue-700` (×3), `text-red-600` (×2), `bg-red-400`, `bg-green-400`.
  Two competing palettes, neither in the system.
- Dark mode is dead code. `.dark` defines 32 tokens; no `ThemeProvider` is
  mounted anywhere, so nothing sets the class. `next-themes` is a dependency but
  its only consumer is `components/ui/sonner.tsx`, whose `useTheme()` therefore
  always returns the default.
- `--radius: 0.625rem` is applied uniformly — dense table cells and large
  surfaces share one radius, so nothing reads as deliberate.
- `framer-motion` is a dependency used in exactly one file (`Jobs.tsx`). There
  is no motion language, and no `prefers-reduced-motion` handling anywhere.
- `App.css` is an empty file still imported by `App.tsx`.

## Design

### 1. Colour tokens

Neutrals carry `0.004–0.008` chroma at hue `95` rather than being pure grey. The
warm cast is the primary tell separating this from the stock palette.

| Token | Light | Dark |
|---|---|---|
| `--paper` | `oklch(0.99 0.004 95)` | `oklch(0.165 0.006 95)` |
| `--paper-sunken` | `oklch(0.972 0.005 95)` | `oklch(0.135 0.006 95)` |
| `--paper-raised` | `oklch(0.998 0.003 95)` | `oklch(0.205 0.007 95)` |
| `--ink` | `oklch(0.18 0.008 95)` | `oklch(0.96 0.004 95)` |
| `--ink-muted` | `oklch(0.52 0.008 95)` | `oklch(0.68 0.006 95)` |
| `--line` | `oklch(0.90 0.005 95)` | `oklch(1 0 0 / 9%)` |

Signal — the only high-chroma hue, reserved for interactive affordance (focus
ring, link, active nav, selection, progress). Never used for semantic state.

| Portal | Light | Dark |
|---|---|---|
| seeker (iris) | `oklch(0.58 0.19 282)` | `oklch(0.72 0.17 282)` |
| recruiter (teal) | `oklch(0.60 0.13 185)` | `oklch(0.74 0.13 185)` |

Semantics sit at hues `25` / `75` / `145` (danger / warn / ok), each ≥40° from
both signal hues. Semantic state is always conveyed by icon **and** label, never
colour alone — required for WCAG 1.4.1 and it makes hue proximity a non-issue.

Elevation is a lightness step on `--paper-*`, not a shadow. Shadows appear only
on true overlays (dialog, popover, dropdown, sheet).

### 2. Portal scoping

`--signal` and its derived tokens are declared on `[data-portal="seeker"]` and
`[data-portal="recruiter"]`. A single wrapper sets `data-portal`; every
component reads the tokens and needs no portal knowledge. Default (no attribute)
falls back to seeker.

| Derived token | Purpose | Light | Dark |
|---|---|---|---|
| `--signal-text` | links and any signal-coloured text on `--paper` | seeker `oklch(0.47 0.19 282)`, recruiter `oklch(0.45 0.11 185)` | seeker `oklch(0.78 0.15 282)`, recruiter `oklch(0.80 0.12 185)` |
| `--signal-fg` | foreground on a signal fill | `oklch(0.99 0.004 95)` | `oklch(0.165 0.006 95)` |
| `--signal-muted` | selection / hover wash | `--signal` @ 12% | `--signal` @ 18% |
| `--signal-ring` | focus-visible ring | `--signal` @ 45% | `--signal` @ 55% |

`--signal` at its base lightness is for non-text use only — rings, indicators,
progress fills, borders. **Any filled element that carries text uses
`--signal-text` as the fill** with `--signal-fg` on top; because `--signal-text`
is already tuned to ≥4.5:1 against `--paper`, that pairing clears AA
comfortably. Base `--signal` against white would land near 3.2:1 and fail for
body copy, which is the trap this split exists to prevent.

`Portal` remains a route literal, exactly as the backend requires — the
attribute is set from the route, never from a request body, query or cookie.

### 3. Typography

Self-hosted via `@fontsource-variable`, subset to latin. No CDN, no layout
shift; `font-display: swap` with metric-compatible fallbacks.

- **Display** — Fraunces Variable (`opsz`, `SOFT`, `WONK` axes): h1–h3, hero.
- **UI** — Geist Sans Variable: all interface text, body, labels, buttons.
- **Data** — Geist Mono Variable: salary, dates, counts, IDs, job references.

Type scale is a 1.2 ratio at UI sizes and 1.333 at display sizes, expressed as
`--text-*` tokens. Monospaced metadata is a deliberate signature: it makes the
product read as engineered rather than assembled.

### 4. Form tokens

Radius is a contrast, not a constant:

| Token | Value | Applies to |
|---|---|---|
| `--radius-sharp` | `4px` | table cells, badges, inputs, dense controls |
| `--radius-surface` | `16px` | cards, panels, dialogs |
| `--radius-full` | `9999px` | avatars, pills |

Borders are 1px at `--line`. Depth comes from border + surface tint.

### 5. Motion tokens and composables

One easing curve (`--ease-out-quint`, `cubic-bezier(0.22, 1, 0.36, 1)`) and a
duration scale: `--dur-fast` 120ms (state change), `--dur-base` 200ms
(transition), `--dur-slow` 380ms (entrance).

A small set of `framer-motion` composables in `lib/motion.ts`: `FadeIn`,
`StaggerList`, `HoverLift`, `SharedElement`. Each reads the duration/easing
tokens and each short-circuits to a no-op when `prefers-reduced-motion: reduce`
matches. Reduced-motion handling lives in the composables so no consumer can
forget it.

### 6. Primitives

Rebuild the 12 existing primitives (`avatar`, `badge`, `button`, `carousel`,
`dialog`, `input`, `label`, `popover`, `radio-group`, `select`, `sonner`,
`table`) onto tokens with CVA variants.

Add 8 that 2B/2C will need: `card`, `tabs`, `dropdown-menu`, `tooltip`,
`skeleton`, `separator`, `sheet`, `pagination`. Each wraps the corresponding
Radix primitive; `radix-ui` and the individual `@radix-ui/*` packages are
already dependencies.

Every primitive: token-only colour, focus-visible ring from `--signal-ring`,
`aria-*` wiring from Radix, keyboard reachable, no hardcoded hex.

### 7. Gallery route

`/_design`, mounted only when `import.meta.env.DEV`. Renders every primitive ×
every variant × light/dark × both portal signals, plus the raw token swatches
and type ramp. This is the review surface for the slice and the regression
check for 2B/2C.

It must not appear in the production bundle — verified by asserting the route
module is absent from `dist/` after `npm run build`.

### 8. Hardcoded colour purge

Replace all ~13 hardcoded colour sites with token classes. This is mechanical
and touches existing components only at the colour level — no layout or logic
change, since those components are rebuilt in 2B/2C anyway. Delete the empty
`App.css` and its import.

Exit check: `grep -rE '(bg|text|border)-\[#|(bg|text|border)-(red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan)-[0-9]' frontend/src` returns nothing.

## Prerequisite (already done)

Node upgraded 20.18.1 → 24.19.0 LTS via nvm-windows; npm 10.8.2 → 11.17.0. Full
`npm run ci` green on the new runtime (196 backend + 11 shared tests, typecheck,
lint, both builds) and the Vite 7 engine warning is gone. `@node-rs/argon2`, the
only native binding, survived the major bump.

## Out of scope

- Any surface rebuild — Home, Jobs, Browse, JobDescription, Profile, auth pages
  and the whole admin surface are 2B/2C. 2A changes their colours only.
- Frontend test runner (Vitest + Testing Library). Deferred to 2B, where there
  are real surfaces to assert against.
- Code splitting the 751 kB bundle. Phase 3.
- Pagination UI. Still deferred; clients request `limit=50`.
- Any backend change. This slice is frontend-only.

## Testing

No frontend test runner exists yet, so verification for this slice is:

1. `npm run typecheck` and `npm run lint` clean.
2. `npm run build` succeeds and the `/_design` module is absent from `dist/`.
3. The grep in §8 returns no hardcoded colour.
4. Visual review of `/_design` in both themes and both portal signals — the
   gallery is built specifically to make this one page rather than twenty.
5. Contrast audit: every text/background pairing in the token matrix meets WCAG
   AA (4.5:1 body, 3:1 large text), checked in both themes.
6. `prefers-reduced-motion: reduce` disables every composable's animation.
