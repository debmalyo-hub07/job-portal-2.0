# Triad on Bone — Colour System Redesign

Status: approved 2026-08-17, **shipped 2026-08-17**. The design intent below
stands. **Its numeric values do not — see [As built](#as-built) for the
corrections and why each was forced.** Read that section before trusting a
number in this one.

Supersedes the ad-hoc palette values behind the
"Ink & Signal" token system. The token *mechanism* (CSS custom properties in
`frontend/src/index.css`, flipped by `.dark` and `data-portal`, mapped into
Tailwind 4 via `@theme inline`, protected by the colour gate and the contrast
probe) survives. What changes is the palette, the token layering, the roles
components consume, and the enforcement surface.

## Problem

The current system passes its gates but fails colour theory:

- **60/30/10 is really ~95/2/3.** There is no visible secondary (30%) layer:
  `paper-sunken` sits within Δ0.03 lightness of `paper` at the same hue, and
  `signal` (the 10%) appears only in buttons, rings and small markers. The
  ratio is unenforced and the vocabulary lacks the tones to build it.
- **No harmony rule binds the wheel.** Portal hues 282°/180°/325° and
  semantic hues 25°/75°/145° were chosen for mutual separation, not from any
  geometric construction on the wheel.
- **The dark theme is a different product.** Light surfaces are cool alabaster
  at hue 260°; dark surfaces are warm olive at hues 60–82°. `paper-raised` in
  dark is pure white (L = 1.0); `paper-sunken` is a near-black hole (L ≈ 0.125);
  `line` is pure white at 9% alpha. `--media-shade`, `--media-surface` and
  `--logo-canvas` never flip, so a pure-white logo canvas sits inside the dark
  UI.
- **Portals are a hue, not a palette.** Each portal defines one saturated colour
  plus "same hue, darker" for text — no tint, no container, no pressed state.

## Decisions (locked with the user)

1. **Ground-up rebrand** — new identity hues and a restructured token system,
   both themes rebuilt from first principles. Gates stay; values and roles
   change.
2. **Identity: "Triad on Bone"** — a warm editorial house (ink on bone) with a
   strict Adobe *triadic* harmony for the three portals: hues exactly 120°
   apart. Seeker = teal ≈200° (clarity, trust, the flagship portal gets the
   flagship hue). Recruiter = gold ≈80° (discernment). Admin = rose ≈320°
   (authority). Warm editorial chosen over default-blues (LinkedIn's lane),
   monochrome-plus-one-accent (cannot give three portals distinct identities),
   and cool-technical-dark (the platform's serif, Fraunces, is warm).
3. **Dark character: deep warm charcoal** — lightness ~0.17–0.20, same warm hue
   family as light, elevation expressed as lightness steps, no pure white, no
   near-black holes, accent area deliberately reduced (dark-mode rule).
4. **Accessibility floor: 4.5:1 text + 3.0:1 UI components** — AA for all text
   (unchanged gate) plus a newly enforced 3:1 floor for borders, icons, focus
   rings and disabled states, which is unenforced today.
5. **Implementation: role-layered rebuild (Approach B)** — three token tiers
   (palette → semantics → roles); components consume roles, not hues; shadcn
   aliases kept as a thin bridge onto roles so the 20 primitives' APIs do not
   change.

## Token architecture

Single file, three tiers, same flip mechanism:

```
index.css
├── @theme inline { … }           Tailwind mapping (unchanged mechanism)
├── TIER 1 · PALETTE              hue constants + per-portal ramps;
│                                 theme-independent, OKLCH
├── TIER 2 · SEMANTICS            surfaces, ink scale, line, media, status;
│                                 flipped by .dark
└── TIER 3 · ROLES                the 60/30/10 contract + interaction states;
                                  flipped by data-portal; shadcn aliases bridge
```

New tokens: `overlay` (dialogs/sheets get their own elevation step instead of
borrowing `paper-raised`), `ink-faint` (captions/decorative text, replacing
scattered `/60` opacity hacks), per-portal `container` / `container-ink`
(the 30% band), `signal-hover` / `signal-pressed` (interaction contract),
`line-strong` (the 3:1 control boundary).

Rules of the structure:

- Components consume roles (`signal`, `container`, `surface`), never hues.
- The shadcn aliases (`primary`, `secondary`, `accent`, …) re-point onto roles.
- Everything derives from the three tiers; no token is invented per component.
- No raw colour anywhere outside `index.css` (existing hard-zero gate stance).

## Palette

All values are spec targets; implementation may tune within ±0.01 L. What the
spec pins hard: the hue angles (the harmony) and the ramp delta system (the
contrast-constancy). OKLCH throughout — equal lightness steps keep contrast
constant along a ramp.

### House — quiet near-white neutral family in light mode

Chroma ≤ 0.012 so the ground reads warm, never yellow.

| Token | Light | Dark |
|---|---|---|
| `paper` | `0.985 0.006 70` | `0.19 0.010 70` |
| `paper-sunken` | `0.94 0.010 70` | `0.145 0.008 70` |
| `paper-raised` | `0.997 0.004 70` | `0.235 0.012 70` |
| `overlay` | `0.999 0.002 70` | `0.27 0.012 70` |
| `ink` | `0.20 0.012 70` | `0.93 0.010 80` |
| `ink-muted` | ≈ `0.43 0.015 70` | ≈ `0.70 0.012 75` |
| `ink-faint` | ≈ `0.56 0.012 70` | ≈ `0.52 0.012 75` |
| `line` | ink at 8% | ink at 12% |
| `line-strong` | `0.6 0.012 70` | `0.55 0.012 75` |

`ink-muted` targets 5.5–6.5:1 on paper; `ink-faint` targets ≥ 3:1 on paper and
is for captions and decorative text only — essential text uses `ink-muted` (a
faint tier that cleared 4.5:1 on white would sit within Δ0.04 lightness of
`ink-muted` and the scale would collapse). `line-strong` is the 3:1 boundary
for inputs and controls; `line` stays a decorative hairline.

### Portals — exact triadic harmony, 120° apart

Each portal defines one anchor; every other step derives by fixed OKLCH deltas
so light and dark ramps stay contrast-constant by construction.

Anchors (light theme): teal `0.55 0.13 200`, gold `0.62 0.15 80`,
rose `0.55 0.18 320`. Gold is the hardest hue — it needs L ≥ 0.60 or it turns
olive — so its anchor sits higher and its text variant lower. The
`signal-text` delta in dark was corrected during plan-writing: L + 0.23
yielded only ≈3.5–3.8:1 on the dark paper for teal and rose, below the 4.5:1
floor; L + 0.34 clears it with margin.

| Ramp step | Light | Dark |
|---|---|---|
| `signal` | anchor | L + 0.17, C × 0.85 |
| `signal-text` | anchor L − 0.15, C × 0.85 | anchor L + 0.34, C × 0.85 (gold: L + 0.25, C × 0.7 — L + 0.34 would clip past 0.97) |
| `container` | L + 0.30, C × 0.25 | L − 0.30, C × 0.25 |
| `container-ink` | ink | ink |
| `signal-hover` | L − 0.04 | L − 0.03 |
| `signal-pressed` | L − 0.08 | L − 0.06 |
| `signal-ring` | solid signal | solid signal |

The container's anchor-relative delta flips sign in dark: in light a container
sits well below paper; in dark it sits just above raised — a tinted surface
either way. The original dark delta (L + 0.42) landed brighter than ink and was
corrected during plan-writing. The 3:1 UI floor likewise killed the alpha
ring: a 35% ring on paper composites to ≈1.3:1, so `signal-ring` is the signal
itself, solid, in both themes.

**Hue-wander rule:** every derived step keeps its anchor hue ± 2°. Only
lightness and chroma may change. Linted.

### Status semantics

- `danger` hue 25°, `warn` hue **65°** (shifts from 75° to clear the gold
  portal by ≥ 15°), `ok` hue 145°.
- Role constraint: warn never tints a surface (icon + label only), so gold and
  orange cannot blur at a glance.
- Separation audit (must hold in the resolved palette): teal↔ok ≥ 55°,
  rose↔danger ≥ 65°, gold↔ok ≥ 65°, gold↔warn ≥ 15°.

### Media layer — theme-aware instead of frozen

- `media-shade` light `0.14 0.012 70`, dark `0.10 0.008 70` — heroes still
  read as a layer above the 0.19 dark page.
- `media-copy` stays light in both themes (copy over photography).
- `logo-canvas` stays theme-invariant (uploaded marks keep their authored
  white ground — a product decision) but gains a hairline border in dark so it
  reads deliberate rather than a hole.

## 60/30/10 role mapping

**60% — surface** (`paper`, `paper-raised`): page grounds, cards, inputs, nav
canvas. Every page's default.

**30% — structure** (`paper-sunken` + per-portal `container`): the layer that
does not visibly exist today, and where per-portal identity lives.

- Panels and sidebars belonging to a portal use `container` instead of neutral
  sunken.
- Selected/active states (active nav item, selected table row, active tab,
  current job card) use `container` + `container-ink`.
- Section banding on long pages alternates paper / paper-sunken so structure
  reads without borders.

**10% — signal**: CTAs, links, focus rings, badges, count highlights.
Saturated, never large-surface. In dark theme the accent area shrinks further
(signal C × 0.85, container C × 0.20 — see the ramp table) — less accent area,
no glare.

### Interaction contract

```
rest      →  signal
hover     →  signal-hover
pressed   →  signal-pressed
focus     →  signal-ring    (35% light / 55% dark)
disabled  →  ink-faint + paper-sunken
```

The exact lightness deltas for `signal-hover` and `signal-pressed` are defined
in the ramp table above (they differ by theme); the contract consumes the
tokens and never restates a delta.

Adopted once by Button, Badge, Tabs, RadioGroup and friends; every portal
inherits it. No component hand-crafts a hover shade.

## Enforcement

1. **`lint:colour`** — existing raw-colour patterns stay at hard zero. Adds:
   no raw `oklch(` outside `index.css`; within portal blocks every derived
   step keeps its anchor hue ± 2°.
2. **`contrast.mjs`** — keeps all text pairings at ≥ 4.5:1; adds the 3:1
   UI-component floor (borders, icons, focus rings, disabled states); adds
   ramp-constancy checks (each ramp step vs its intended background within
   tolerance).
3. **60/30/10 visual audit** — new `/_design` gallery view; renders each
   portal × theme and reports computed area share over role-tagged elements.
   Target on representative screens: 60±5 / 30±5 / 10±5.
4. **Status-hue separation audit** — assert teal/rose/gold vs danger/warn/ok
   stay ≥ 15° apart in the resolved palette.

## Rollout

Each step independently green; a revert is one step.

1. **Tiers 1–2 in `index.css`** — house + ramps + dark rebuild.
2. **Portal ramps + shadcn alias re-point** — triad lands, aliases bridge onto
   roles. Full `contrast.mjs` run.
3. **Primitive interaction contract** — Button/Badge/Tabs/RadioGroup/Select/
   Input adopt hover/pressed/focus/disabled tokens.
4. **Role wiring in pages** — containers, selected states, section banding,
   `ink-faint` captions.
5. **Gallery + gates** — admin portal added to `/design`, 60/30/10 audit view,
   hue-wander lint, 3:1 floor. Screenshot baselines re-baselined here, not
   mid-flight.

## Migration surface

| Layer | Work |
|---|---|
| `index.css` | Full rewrite of tiers 1–3; shadcn aliases re-point onto roles |
| Primitives (`ui/`) | Interaction contract; no API changes |
| Navbar, Footer, HeroSection, PortalPanel, auth pages | media-layer + container-role wiring; opacity-hack captions → `ink-faint` |
| Workspace pages (job list, dashboard, admin console) | selected-state + section-banding roles |
| `/design` gallery | Admin portal added; new 60/30/10 audit + ramp views |

## Non-goals

No backend changes. No new portals. No motion/radius/type changes. No
token-package extraction (rejected as Approach C). No per-page custom palettes
— everything flows from the three role tiers.

## Success criteria

- All text pairings ≥ 4.5:1 and all UI components ≥ 3:1, both themes, all
  three portals, verified by the expanded `contrast.mjs`.
- Portal hues resolve to the exact triad (200/80/320 ± 2°); no hue wander.
- Dark theme reads as the same product in a different register: same warm hue
  family, elevation by lightness steps, no pure white, no near-black wells.
- The 60/30/10 audit reports within 60±5 / 30±5 / 10±5 on representative
  screens.
- Colour gate hard zero: no raw colour, no `oklch(` outside `index.css`.

## As built

Verification before implementation found **26 failing checks in 6 classes** in
the palette above. The intent survived; most of the arithmetic did not. The
root error is one idea: **the spec derived every ramp by uniform OKLCH deltas
(`C × 0.85`, `L + 0.34`), but sRGB's chroma ceiling varies ~2.8× by hue.** A
delta that is safe at 320° is unrenderable at 80°, and a browser clamps
out-of-gamut channels independently, which *shifts the hue* — silently defeating
the ±2° hue-wander guarantee the same spec asks for. Ramps are now derived per
hue by binary search against the in-gamut ceiling.

The shipped values live in `frontend/src/index.css` and are the single source of
truth. What changed and why:

| Spec said | Shipped | Why |
|---|---|---|
| dark `signal-fg` implicitly light | `var(--paper)` | Dark fills are *light*, so their foreground is the dark ground. The spec's polarity measured 1.59–2.42:1 across 9 pairings |
| `signal-ring` = solid signal | aliases `signal-text` | A focus ring is UI at 3:1; solid gold on bone paper measured 1.70:1 |
| gold anchor `0.62 0.15 80`, light text | `0.80 0.164 80`, `var(--ink)` text | Gold below L 0.60 reads olive. Keeping a real gold forces a *light* fill with dark text — recruiter's fill polarity is inverted relative to seeker and admin, and it needs `signal-edge` for the 3:1 boundary its lightness cannot supply |
| `warn` hue 65°, ≥15° from gold | hue 55°, and L 0.54 vs gold's 0.80 | 15° is not separable at similar lightness. Warn now differs on two axes: 25° of hue and 0.26 of lightness |
| light `line` = ink at 8% | 12% | 8% measured 1.08:1 — a divider you cannot see |
| light `paper` `0.985` | `0.972`, then `0.948` (2026-08-19) | A near-white paper leaves `sunken`/`raised` no room. 0.972 was still too high: it bought a 1.06:1 card step and a 1.02:1 popover step. See the 2026-08-19 amendment |
| one grade per status | a fill grade **and** a text grade | Not in the spec at all, and the most serious find: a tinted badge is a wash of its own status colour, so darkening the type darkens the wash proportionally and the ratio barely moves. The *already shipped* `bg-ok/15 text-ok` badges measured **4.01:1 in every portal** — a live WCAG 1.4.3 failure nothing had ever measured. Dark mode needs no text grade; its wash darkens toward the ground while the type stays light |
| `signal-muted` panel pairs with `ink-muted` | pairs with `ink` | ink-muted on that panel lands 2.74–3.33:1 at every useful alpha |
| roles per portal block | declared once in `:root` — **wrong, corrected 2026-08-19** | The stated reason was that "a custom property resolves its `var()` in the consuming scope". It does not. A custom property is substituted at the element that *declares* it, and descendants inherit the already-resolved value. `--signal` lived on the `[data-portal]` div, so the three `:root`-declared derivatives resolved once against seeker's teal and every other portal inherited it. See the 2026-08-19 amendment |
| — | `shade` added | A scrim must dim its backdrop in *both* themes; `bg-ink/40` lightened the page in dark mode |

### Enforcement, as built

`tests/visual/contrast.mjs` needs a running dev server, so `npm run ci` had never
executed it — the 4.5:1 and 3:1 floors were documented and unenforced. The gate
is now `frontend/scripts/check-colour-contrast.mjs`: pure Node, no browser, **551
checks** over all six theme×portal scopes, run by `lint:colour` in CI. It holds
no palette of its own — it parses `index.css`, replays the cascade, and derives
the portal anchors from the parsed values, so a redesign changes what it checks
with no second copy to drift. It was mutation-tested against seven regression
classes (inverted polarity, collapsed status grades, invisible hairline, broken
triad, faint prose, flat container, gamut clip); all seven fail it.

`check-colour-tokens.mjs` gained a **dead-class** check, which found two live
bugs: `text-warn-text` in `LegalDraftNotice.tsx` had been drawing an uncoloured
icon for as long as the file existed, and `bg-shade/60` left the dialog scrim
fully transparent. Both are the same defect — a palette token used as `bg-x`
without a `--color-x` alias emits no CSS, raises no error, and renders
uncoloured. The check compares the two halves of `index.css` against each other,
so it needs no list to maintain.

### Not shipped

Success criterion 4 — a **numeric** 60/30/10 area audit reporting 60±5 / 30±5 /
10±5 — did not ship. Measuring painted area share requires a browser, and the
number would drift with page content rather than with the palette, making it a
gate that fails for the wrong reasons. What shipped instead: `container` wired
into the three genuine chrome surfaces (workbench rail, tabs list, table header),
and a proportional band demo in `/design` showing the split directly. The rule is
demonstrated and structurally enforced; it is not asserted as a measured number.

---

## Amendment — 2026-08-19: recalibration, and the bug the `:root` decision caused

Reported as "the light mode palette is terribly built, and it is the same for
every role". Both halves were correct, and they had different causes.

### 1. The role aliases were frozen to seeker's teal

`--signal-muted`, `--signal-ring` and `--signal-edge` were declared once in
`:root`, on the reasoning quoted in the "As built" table above. That reasoning is
false. A custom property is substituted at the element that **declares** it and
descendants inherit the resolved value; it is not re-resolved per consumer.
`--signal` is declared on the `[data-portal]` element, which `PortalScope` renders
as a `div` below `<html>`, so the three derivatives could only ever see seeker's
teal.

Twelve wrong values — recruiter and admin, light and dark, three tokens each, every
one exactly 120° off its anchor — across 63 usages: 26 focus rings, 28 accent
washes, 9 filled-control borders. In the recruiter workspace every focus ring was
teal, every `Select` and `DropdownMenu` highlight was teal (`focus:bg-signal-muted`),
and the gold primary button carried a teal border — load-bearing, because gold
measures 1.75:1 against paper and cannot supply its own boundary.

It survived a 440-check gate because **it is not a contrast failure**. Measured, the
shipped recruiter badge was 5.68:1 and admin 5.73:1, both clear of 4.5:1. Only the
hue was wrong. And `scope()` merged `:root` with the portal block into a single map
before resolving, so the gate computed the value the author intended rather than the
one the browser painted.

### 2. Radix overlays never saw the portal at all

A larger instance of the same class. `Dialog`, `DropdownMenu`, `Select`, `Popover`,
`Sheet`, `Tooltip` and Sonner's toaster all render into a portal on `document.body`,
which is a **sibling** of the `PortalScope` div. Inheritance follows the DOM, not
the React tree, so every overlay in the application took *all* of its signal tokens
from `<html>` — not just the three derivatives.

`PortalScope` now mirrors the portal onto `document.documentElement`, which is where
`next-themes` already writes the theme class for the same reason. The wrapper `div`
stays: `/design` renders three portals on one document, and `canvasShader` resolves
its hue through `closest("[data-portal]")`. Because `.dark` and `data-portal` now
land on one element, each dark portal block is selected twice — `.dark[data-portal=X]`
for that case and `.dark [data-portal=X]` for the div. Ship one without the other and
either every overlay or the whole gallery loses its portal colour.

### 3. `--overlay` had never been wired to an overlay

`bg-overlay` appeared in exactly one place in the codebase: a swatch in `/design`.
Every real overlay used `bg-paper-raised` — the *card* surface — so a popover over a
card was the same colour, separated only by a default shadow. The token documented an
intent that was never implemented. All five surfaces now use it.

### 4. Light mode's elevation ladder was collapsed

| step | light was | light now | dark was | dark now |
|---|---|---|---|---|
| card vs page | 1.06:1 | **1.12:1** | 1.11:1 | 1.15:1 |
| popover vs card | 1.02:1 | 1.03:1 + `--elevate-3` | 1.11:1 | 1.17:1 |
| lightness span | 0.064 | **0.095** | 0.125 | **0.178** |

All six figures are read back out of `index.css` rather than recorded from the
working notes; the two spans in an earlier draft of this amendment were estimates
and both were wrong.

The cause is arithmetic, not taste: light-mode elevation reads as *lighter*, and at
`paper` L 0.972 there is almost no headroom left above the page. Dark mode has the
whole range below its page and gets its steps for free.

So the two themes **cannot share one elevation strategy**, and that is now explicit.
`paper` remains at L 0.948 for the required light-mode elevation range, while its
chroma was later reduced to 0.003 and the structural container chroma to 0.034.
This keeps the card step without the former cream cast or cyan-heavy chrome.
(`ink` stays at 15.55:1). The top of the ladder cannot be fixed by lightness at all —
near white there is nothing left to spend — so it is carried by three new
`--elevate-1/2/3` shadow tokens, deliberately heavier in light than in dark.

### 5. Interaction states

Hover moved 1.13–1.19:1 between states, the weakest end of the useful range. Ramps
were re-derived per hue against the in-gamut ceiling for a ≥1.18:1 hover step and
≥1.16:1 pressed step, with the label held ≥4.5:1 at *every* state — the binding
constraint for recruiter, whose light gold fill carries dark text and so loses label
contrast as it darkens.

Also fixed: `Card` had no interaction states at all and is the primary content unit,
so it gains an opt-in `interactive` variant (opt-in because most cards are containers,
and a container that lights up promises a click that never happens). `Input` had no
hover. `Profile.tsx` had the one raw focus gap in the codebase.

`landing-interactions.css` had two defects. Its entire hover block sat inside
`@media (prefers-reduced-motion: no-preference)`, so a reader who asks for less motion
got **no hover feedback at all** — not a border, not a shade. State and movement are
now separate queries. And its hover shadow was `color-mix(in oklab, var(--ink) 12%, …)`;
`--ink` is near-white in dark mode, so that painted a white glow around the card —
precisely the failure `--shade` exists to prevent, as `index.css` documents where that
token is declared.

### 6. One data table, three appearances

Same component, same semantics, three treatments: recruiter tables were wrapped in a
bordered elevated panel, the three admin consoles in a bare `overflow-x-auto` div with
no surface, and the seeker's applied-jobs table in a plain `<div>` with neither a
surface nor horizontal scroll — an overflow bug at narrow widths. The surface moved
into the `Table` primitive's own container and all six call-site wrappers were removed.

### 7. Chroma left on the table

sRGB's chroma ceiling varies by hue *and* by lightness, and admin was using 67% of
what was available (0.170 of 0.252 at L 0.52). Admin's fill is now C 0.255, a ~50%
increase. Seeker cannot be improved this way: 200° is the poorest hue on the wheel for
chroma in sRGB, capping near 0.09 at usable lightnesses, and was already at 99% of its
ceiling — close enough to clip, which is why it now carries a 3% safety margin.

### The triad was re-derived and deliberately kept

All 120 triad rotations were swept against the sRGB gamut, the ≥20° status-hue
separation, and hue distance from the bone ground. Ranked by the weakest of the three
hues, 80/200/320 does not win — 100/220/340 does, by roughly 0.01 chroma.

It was kept anyway. The margin is negligible, the semantics are right (blue = trust
for candidates, gold = value for employers, rose = authority for admin), and the
"optimal" rotation turns the gold to lime. The one finding worth recording is that the
recruiter gold sits only 10° from the 70° bone ground; that is harmony rather than a
defect, and the 1.75:1 contrast it produces is a *lightness* problem already solved by
`--signal-edge` — which makes getting that token's hue right (§1) matter more for
recruiter than for either other portal.

Confirmed numerically: at 80° the chroma ceiling **rises** with lightness to a peak at
L 0.80 and falls to 0.105 by L 0.50. A dark gold is not available in sRGB. The
recruiter fill is forced to be light with dark text, exactly as the original build
found by eye.

### Enforcement

`lint:colour` goes from 440 to **551 checks**. Every floor added is a *step* rather
than a level, because the original gate asked whether a pairing was legible and never
whether two things that must look different actually do:

- `--signal-muted/-ring/-edge` must be **declared** in each portal block. Declaration
  site is the only honest assertion here, since resolving values through the merged
  `scope()` reproduces the intended value rather than the painted one.
- `.dark[data-portal=X]` (same element) must exist, or overlays keep the light ramp.
- `--elevate-1/2/3` must be declared in both themes.
- The ladder must be **ordered** (`sunken < paper < raised < overlay` by L) and its two
  affordable steps must clear 1.09:1. `raised → overlay` is deliberately given no
  floor; it is carried by shadow.
- `signal`/`danger` must change ≥1.15:1 rest→hover and ≥1.13:1 hover→pressed.
- Hue wander now covers the three derivatives, and uses `hueDistance` rather than a raw
  subtraction — which reported 240 for a 120° error.
- `ink-muted`, `ink-faint` and `line-strong` are now checked on `overlay` too. That is
  what caught dark `ink-faint` falling to 2.77:1 when dark `overlay` was raised.

Mutation-tested against seven regressions — the freeze reintroduced, a flat ladder, an
inverted ladder, a weak hover step, a missing same-element selector, a missing
elevation token, and a derived token hard-coded to the wrong portal's hue. All seven
fail the gate.

## Amendment — 2026-08-20: the bone went gray, and the shadow hand-off was half-built

Two defects, and they share a cause: §4 of the 2026-08-19 amendment made a correct
decision and then under-delivered on the half of it that was not arithmetic.

### 1. Chroma ≤ 0.012 was a ceiling with no floor

The house palette above says "Chroma ≤ 0.012 so the ground reads warm, never yellow"
and specified `paper` at `0.985 0.006 70`. §4 then dropped light `paper` to chroma
**0.003** to remove a "cream cast". That crossed a boundary the spec never named: at
L 0.95 a chroma of 0.003 sits at or below the just-noticeable difference, so the hue
was still 80° and simply invisible.

Measured as red-to-blue channel spread in sRGB — what the eye actually reads as a tint:

| | light was | light now | dark |
|---|---|---|---|
| `paper` | `#efedeb`, spread 4 (**1.7%** of its red channel) | `#f2ebe1`, spread 17 (7.0%) | `#17130f`, spread 8 (**34.8%**) |
| `paper-sunken` | `#e0deda`, spread 6 | `#e8dfd2`, spread 22 | `#080503`, spread 5 |

A palette named for bone was painting neutral gray in the theme most people use, and
the two themes were no longer one family: dark mode was warm charcoal, light mode was
office fluorescent. That is what "the lighting is off" describes, and no floor in the
gate could see it — it is not a contrast failure, not a gamut failure, and not a
hue-wander failure.

**There are two failure modes on this axis and the spec had named only one.** The
ceiling stays; a floor joins it. `lint:colour` now holds `paper` and `paper-sunken` to
chroma ≥ 0.008 in *both* themes and requires the two themes' `paper` to agree within
0.006, so neither "too yellow" nor "invisible" can ship. `paper-sunken` at 0.020 is
above the old ceiling deliberately: the ceiling was written for the page, and the band
beneath the page is where the ground's identity is most legible.

### 2. The ladder delegated to shadow; the shadows could not carry it

§4's arithmetic was right — light mode has ~0.09 of lightness above a page that still
reads as paper, so `raised → overlay` has to be carried by `--elevate-3` and the gate
records that exemption at the assertion. What shipped alongside it was a shadow set at
**6-7% of `--shade`**, fainter than the 0.1-alpha black in the middle of Tailwind's own
default scale. Both mechanisms were simultaneously too weak. A card sat on the page at
1.12:1 with no shadow worth the name and a popover sat on a card at 1.026:1 with
nothing at all, and 551 checks passed over it, because a delegation had been recorded
but never verified.

Twelve component surfaces made it worse: `rounded-surface border border-line
bg-paper-raised … shadow-sm` had been hand-copied six times in place of the `Card`
primitive, so those surfaces took Tailwind's 5% **pure black** — off the token system,
outside the contrast gate, and identical in both themes.

Fixed on all three fronts:

- The ground is redistributed so all three rungs clear the floor — the page came *down*
  to L 0.943, which §4 had ruled out on the grounds that it would look dingy. That is
  true of a neutral and false of a warm value: chroma is what buys the headroom.
- Each elevation grade is layered rather than scaled — a tight contact shadow, a mid
  form shadow, and on grades 2 and 3 a wide ambient that carries what lightness cannot.
- `check-colour-tokens.mjs` fails on Tailwind's whole shadow scale
  (`shadow-2xs…2xl`, `inner`). `shadow-none` remains a reset, not a colour.

`--ink` also comes down from 15.56:1 to 14.11:1 and onto the ground's warm family.
Near-black on near-white is the maximum-glare pairing in the palette and nothing needs
15:1 when the floor is 4.5:1.

| step | light before | light after | dark (unchanged) |
|---|---|---|---|
| `sunken → paper` | 1.158 | 1.116 | 1.099 |
| `paper → raised` | 1.118 | 1.090 | 1.147 |
| `raised → overlay` | **1.026** | 1.057 + a real `--elevate-3` | 1.171 |

### Enforcement

`lint:colour` goes from 551 to **556 checks**. Both new gates were shown to fail before
being trusted: the chroma floor rejects the shipped ground three times over (both
surfaces, plus the cross-theme agreement check), and the shadow rule catches a single
`shadow-sm` restored to one component.
