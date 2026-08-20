// Colour-system gate: contrast, sRGB gamut, and triadic harmony, read straight
// out of index.css.
//
// There is a Playwright probe at tests/visual/contrast.mjs that measures what
// Chrome actually paints. It needs a running dev server, so `npm run ci` has
// never run it, which meant the 4.5:1 and 3:1 floors were documented and
// unenforced. This check needs nothing but Node, so it runs on every push.
//
// It deliberately holds no palette of its own. It parses the token blocks,
// replays the cascade for each theme x portal, and derives the portal hue
// anchors from the parsed values. A redesign that changes index.css changes
// what this file checks; there is no second copy to drift out of sync.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// An explicit path argument exists so the gate can be pointed at a mutated copy
// of the palette to prove it still fails; a check nobody has seen fail is not a
// check.
const CSS_PATH = process.argv[2] ?? path.join(HERE, "..", "src", "index.css");

const TEXT = 4.5; // WCAG 1.4.3, body text
const UI = 3.0; // WCAG 1.4.11, control boundaries, focus rings, icons
const HAIRLINE = 1.1; // house rule: a divider you cannot see is not a divider
const BAND = 1.2; // house rule: the 30% container must read as its own field
const HUE_WANDER = 2; // degrees a ramp may drift from its portal anchor
// Added after the first system shipped green while looking visibly flat. Each of
// these is a *step* rather than a level: the original gate asked whether a
// pairing was legible and never whether two things that must look different
// actually do.
const ELEVATION = 1.09; // a card that does not lift off the page is not a card
const STATE_STEP = 1.15; // rest -> hover must read as a change
const PRESS_STEP = 1.13; // hover -> pressed likewise
const STATUS_GAP = 20; // degrees a portal hue must keep from every status hue
const CLIP_TOLERANCE = 0.002; // out-of-gamut margin before a browser clamps and shifts hue

// ---------------------------------------------------------------- colour maths
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function oklchToLinear(L, C, hueDeg) {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lp ** 3;
  const m = mp ** 3;
  const s = sp ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// How far outside sRGB a value sits. A browser clamps each channel
// independently, which moves the hue, so an out-of-gamut token silently
// defeats the hue-wander guarantee the rest of this file enforces.
function clipAmount(L, C, hue) {
  let worst = 0;
  for (const v of oklchToLinear(L, C, hue)) {
    if (v < 0) worst = Math.max(worst, -v);
    if (v > 1) worst = Math.max(worst, v - 1);
  }
  return worst;
}

const encode = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
const decode = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);

// Gamma-encoded sRGB channels, clamped the way a browser clamps them. A colour
// that has already been composited carries its channels directly.
const toSrgb = (colour) =>
  colour.srgb ?? oklchToLinear(colour.L, colour.C, colour.hue).map((v) => encode(clamp01(v)));

function relativeLuminance(srgb) {
  const [r, g, b] = srgb.map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Alpha tokens (--line, --signal-muted) only have a contrast ratio relative to
// something, so they are composited over their stated backdrop first.
function flatten(colour, backdrop) {
  const top = toSrgb(colour);
  if (colour.alpha >= 1) return top;
  const under = flatten(backdrop, backdrop);
  return top.map((v, i) => v * colour.alpha + under[i] * (1 - colour.alpha));
}

function ratio(foreground, background) {
  const a = relativeLuminance(flatten(foreground, background));
  const b = relativeLuminance(flatten(background, background));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// A translucent panel is a surface in its own right once painted, so it needs an
// opaque stand-in before anything is measured against it.
const over = (colour, backdrop) => ({ srgb: flatten(colour, backdrop), alpha: 1 });

const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ------------------------------------------------------------------- css parse
const css = await readFile(CSS_PATH, "utf8");
// Comments are stripped first: the palette's own commentary contains commas and
// would otherwise be spliced into the selector lists below.
const source = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Blocks with no nested braces — that covers every token block and skips the
// at-rules wrapping them. The selector cannot contain a brace or a semicolon,
// which is what makes each match start cleanly after the previous block's `}`
// without consuming it: anchoring on `}` instead would swallow the delimiter and
// silently drop every second block.
const blocks = new Map();
for (const match of source.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
  const [, selectorList, body] = match;
  const declarations = new Map();
  for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(decl[1], decl[2].trim());
  }
  if (declarations.size === 0) continue;
  for (const selector of selectorList.split(",").map((s) => s.replace(/\s+/g, " ").trim())) {
    const existing = blocks.get(selector) ?? new Map();
    for (const [k, v] of declarations) existing.set(k, v);
    blocks.set(selector, existing);
  }
}

// The cascade, replayed. House tokens live in :root / .dark and portal tokens
// in the [data-portal] blocks, so a plain ordered merge reproduces what the
// browser resolves without needing a specificity model.
function scope(theme, portal) {
  const chain =
    theme === "light"
      ? [":root", `[data-portal="${portal}"]`]
      : [":root", ".dark", `[data-portal="${portal}"]`, `.dark [data-portal="${portal}"]`];
  const merged = new Map();
  for (const selector of chain) {
    for (const [k, v] of blocks.get(selector) ?? []) merged.set(k, v);
  }
  return merged;
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/;
const MIX = /^color-mix\(\s*in oklab\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/;

// Resolve a token to {L, C, hue, alpha}, following var() chains and the one
// color-mix form the palette uses. Anything else is a hard error rather than a
// silent skip: a token this gate cannot read is a token it cannot vouch for.
function resolve(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular var reference at ${name}`);
  seen.add(name);
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`token ${name} is not declared`);
  return parse(tokens, raw, seen, name);
}

function parse(tokens, raw, seen, origin) {
  const varOnly = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (varOnly) return resolve(tokens, varOnly[1], seen);

  const mix = raw.match(MIX);
  if (mix) {
    const base = parse(tokens, mix[1].trim(), seen, origin);
    return { ...base, alpha: base.alpha * (Number(mix[2]) / 100) };
  }

  const literal = raw.match(OKLCH);
  if (literal) {
    return {
      L: Number(literal[1]),
      C: Number(literal[2]),
      hue: Number(literal[3]),
      alpha: literal[4] === undefined ? 1 : Number(literal[4]) / 100,
    };
  }
  throw new Error(`cannot read ${origin}: ${raw}`);
}

// ------------------------------------------------------------------- the checks
let failures = 0;
let checks = 0;
const fail = (message) => {
  failures++;
  console.log("FAIL  " + message);
};

// Every token that is a function of --signal must be *declared* in each portal
// block rather than inherited from :root.
//
// This is the check the previous system lacked, and its absence let a
// twelve-value bug ship. A custom property substitutes its var() at the element
// that declares it and then inherits the already-resolved value; it does not
// re-resolve per consumer. --signal is declared on the [data-portal] element, so
// a :root-only derivative resolved once against seeker's teal and every other
// portal inherited it: teal focus rings, teal control borders and teal menu
// washes in the gold workspace and the rose console. All of them still cleared
// 4.5:1, which is why a contrast-only gate stayed green.
//
// Resolving values here cannot catch it, because scope() below merges :root with
// the portal block and so computes the value the author intended rather than the
// one the browser paints. The declaration site is the honest thing to assert, and
// it is what /design depends on too: that page puts three data-portal blocks on
// one document, so each must carry its own derivation.
const DERIVED_FROM_SIGNAL = ["--signal-muted", "--signal-ring", "--signal-edge"];
for (const portal of ["seeker", "recruiter", "admin"]) {
  for (const selector of ['[data-portal="' + portal + '"]', '.dark [data-portal="' + portal + '"]']) {
    const declared = blocks.get(selector);
    for (const token of DERIVED_FROM_SIGNAL) {
      checks++;
      if (!declared || !declared.has(token)) {
        fail(token + " is not declared in " + selector + " - it would inherit :root's seeker value");
      }
    }
  }
}

// The dark portal blocks are selected twice on purpose. PortalScope mirrors the
// portal onto <html>, which is also where next-themes writes `.dark`, so on a
// dark page both land on one element and only the no-space form matches it.
// Radix renders every overlay into a portal on document.body, outside the
// PortalScope div, so <html> is the only element those can inherit from.
for (const portal of ["seeker", "recruiter", "admin"]) {
  checks++;
  if (!blocks.has('.dark[data-portal="' + portal + '"]')) {
    fail('.dark[data-portal="' + portal + '"] (same element) is missing - overlays on <html> would keep the light ramp');
  }
}

// Light mode cannot separate its top two surfaces by lightness, so it separates
// them by shadow. If the elevation tokens go missing that separation silently
// becomes nothing at all.
for (const [selector, theme] of [[":root", "light"], [".dark", "dark"]]) {
  for (const token of ["--elevate-1", "--elevate-2", "--elevate-3"]) {
    checks++;
    const declared = blocks.get(selector);
    if (!declared || !declared.has(token)) fail(token + " is not declared for " + theme);
  }
}
const report = (label, value, floor) => {
  checks++;
  const ok = value >= floor;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${value.toFixed(2).padStart(6)}:1  (needs ${floor})  ${label}`);
  }
};

// Every literal in the file must be renderable. This walks the raw text rather
// than the resolved scopes so a token no scope happens to reference is still
// covered.
for (const match of css.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
  const [, L, C, hue] = match.slice(0, 4).map(Number);
  const clip = clipAmount(L, C, hue);
  checks++;
  if (clip > CLIP_TOLERANCE) {
    failures++;
    console.log(`FAIL  oklch(${L} ${C} ${hue}) is outside sRGB by ${clip.toFixed(4)} — the browser will clamp it and shift its hue`);
  }
}

const anchors = {};

for (const theme of ["light", "dark"]) {
  for (const portal of ["seeker", "recruiter", "admin"]) {
    const t = scope(theme, portal);
    const get = (name) => resolve(t, name);

    const paper = get("--paper");
    const sunken = get("--paper-sunken");
    const raised = get("--paper-raised");
    const overlay = get("--overlay");
    const ink = get("--ink");
    const where = `${theme} ${portal}`;

    // 60% — ground and ink ramp
    for (const [name, surface] of [
      ["paper", paper],
      ["paper-sunken", sunken],
      ["paper-raised", raised],
      ["overlay", overlay],
    ]) {
      report(`${where}: ink on ${name}`, ratio(ink, surface), TEXT);
    }
    for (const [name, surface] of [
      ["paper", paper],
      ["paper-sunken", sunken],
      ["paper-raised", raised],
      ["overlay", overlay],
    ]) {
      report(`${where}: ink-muted on ${name}`, ratio(get("--ink-muted"), surface), TEXT);
    }
    // ink-faint is a caption/placeholder value, so it answers to 3:1 and must
    // never carry prose. overlay is included rather than assumed to duplicate
    // paper: it is the lightest surface in light mode and the lightest in dark
    // mode, so it is the binding case at both ends. Raising dark overlay during
    // this pass is exactly what pushed dark ink-faint under 3:1.
    for (const [name, surface] of [["paper", paper], ["paper-sunken", sunken], ["overlay", overlay]]) {
      report(`${where}: ink-faint on ${name}`, ratio(get("--ink-faint"), surface), UI);
    }

    // The elevation ladder has to be an actual ladder. Ordering is asserted
    // separately from spacing, because a palette can keep every pairing legible
    // while putting the brightest value in the document on a card rather than on
    // the page - which is what made paper-raised pure white in an earlier draft.
    const ladder = [
      ["paper-sunken", sunken],
      ["paper", paper],
      ["paper-raised", raised],
      ["overlay", overlay],
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      const [loName, lo] = ladder[i - 1];
      const [hiName, hi] = ladder[i];
      checks++;
      if (!(hi.L > lo.L)) {
        fail(`${where}: ${hiName} (L ${hi.L}) must sit above ${loName} (L ${lo.L}) in the ladder`);
      }
    }
    // raised -> overlay is deliberately not given a floor: near white there is no
    // lightness left to spend, so that step is carried by --elevate-3. The two
    // below are the ones either theme can always afford, and both were failing
    // before this pass - paper-raised vs paper measured 1.06:1 in light mode.
    report(`${where}: paper-sunken to paper is a visible step`, ratio(sunken, paper), ELEVATION);
    report(`${where}: paper to paper-raised is a visible step`, ratio(paper, raised), ELEVATION);

    // 30% — structure
    for (const [name, surface] of [["paper", paper], ["paper-raised", raised], ["paper-sunken", sunken]]) {
      report(`${where}: line-strong on ${name}`, ratio(get("--line-strong"), surface), UI);
    }
    report(`${where}: line hairline visible on paper`, ratio(get("--line"), paper), HAIRLINE);

    const container = get("--container");
    report(`${where}: container band reads against paper`, ratio(container, paper), BAND);
    report(`${where}: container-ink on container`, ratio(get("--container-ink"), container), TEXT);
    report(`${where}: ink-muted on container`, ratio(get("--ink-muted"), container), TEXT);

    // photographic surfaces. These are dark in *both* themes, so a token that
    // flips with the theme cannot be trusted on them — --signal is checked here
    // because the auth panel draws its list icons in it.
    report(`${where}: media-copy on media-shade`, ratio(get("--media-copy"), get("--media-shade")), TEXT);
    report(`${where}: media-surface-ink on media-surface`, ratio(get("--media-surface-ink"), get("--media-surface")), TEXT);
    report(`${where}: signal as icon on media-shade`, ratio(get("--signal"), get("--media-shade")), UI);

    // status. The fill grade answers to the fill floors; the text grade answers
    // to every surface it can land on, including its own wash. Checking the
    // fill as type is what caught the 4.01:1 badge the old system shipped.
    for (const name of ["danger", "warn", "ok"]) {
      report(`${where}: ${name}-fg on ${name} fill`, ratio(get(`--${name}-fg`), get(`--${name}`)), TEXT);
      const text = get(`--${name}-text`);
      for (const [surface, colour] of [["paper", paper], ["paper-raised", raised], ["paper-sunken", sunken]]) {
        report(`${where}: ${name}-text on ${surface}`, ratio(text, colour), TEXT);
      }
      const wash = get(`--${name}-muted`);
      report(`${where}: ${name}-text on ${name}-muted over paper`, ratio(text, over(wash, paper)), TEXT);
      report(`${where}: ${name}-text on ${name}-muted over paper-raised`, ratio(text, over(wash, raised)), TEXT);
      report(`${where}: ${name}-muted wash reads against paper`, ratio(over(wash, paper), paper), HAIRLINE);
    }
    // danger is the one status that is also a button fill, so its interaction
    // ramp is held to the same rule as signal's.
    for (const state of ["-hover", "-pressed"]) {
      report(`${where}: danger-fg on danger${state}`, ratio(get("--danger-fg"), get(`--danger${state}`)), TEXT);
    }

    // 10% — signal. The whole interaction ramp is checked, not just rest state:
    // a hover that loses contrast is a hover that fails WCAG mid-gesture.
    const signalFg = get("--signal-fg");
    for (const state of ["", "-hover", "-pressed"]) {
      report(`${where}: signal-fg on signal${state}`, ratio(signalFg, get(`--signal${state}`)), TEXT);
    }
    // A hover nobody can see is not a hover. The shipped ramps moved 1.13-1.19:1
    // between states, which is the weakest end of the useful range and a large
    // part of why the app read as inert. Contrast with the *label* is checked
    // above; this checks contrast with the *previous state*, which is the thing
    // the pointer is looking for and which nothing had ever measured.
    for (const [label, from, to, floor] of [
      ["signal to signal-hover", "--signal", "--signal-hover", STATE_STEP],
      ["danger to danger-hover", "--danger", "--danger-hover", STATE_STEP],
      ["signal-hover to signal-pressed", "--signal-hover", "--signal-pressed", PRESS_STEP],
      ["danger-hover to danger-pressed", "--danger-hover", "--danger-pressed", PRESS_STEP],
    ]) {
      report(`${where}: ${label} is a visible change`, ratio(get(from), get(to)), floor);
    }
    const signalText = get("--signal-text");
    for (const [name, surface] of [
      ["paper", paper],
      ["paper-raised", raised],
      ["paper-sunken", sunken],
      ["container", container],
    ]) {
      report(`${where}: signal-text on ${name}`, ratio(signalText, surface), TEXT);
    }
    report(`${where}: signal-ring on paper`, ratio(get("--signal-ring"), paper), UI);
    report(`${where}: signal-edge on paper`, ratio(get("--signal-edge"), paper), UI);
    // The muted panel pairs with --ink, never --ink-muted: at every alpha worth
    // using, ink-muted on this panel lands between 2.7:1 and 3.3:1.
    const signalPanel = over(get("--signal-muted"), paper);
    report(`${where}: ink on signal-muted panel`, ratio(ink, signalPanel), TEXT);
    report(`${where}: signal-text on signal-muted panel`, ratio(signalText, signalPanel), TEXT);

    // A ramp that drifts in hue stops reading as one colour. Out-of-gamut
    // clipping is the other way this breaks, and it is checked above.
    const anchor = get("--signal").hue;
    anchors[portal] = anchor;
    for (const name of [
      "--signal",
      "--signal-hover",
      "--signal-pressed",
      "--signal-text",
      "--container",
      // Checked here as well as at the declaration site above. Declaration proves
      // they are in scope; hue proves they are in scope of the *right* portal.
      // The shipped bug put all three exactly 120deg off anchor.
      ...DERIVED_FROM_SIGNAL,
    ]) {
      // hueDistance rather than a raw subtraction: the derived tokens can land on
      // the far side of 0deg from their anchor, where a subtraction reports 240
      // for a 120deg error and 358 for a 2deg one.
      const drift = hueDistance(get(name).hue, anchor);
      checks++;
      if (drift > HUE_WANDER) {
        fail(`${where}: ${name} sits ${drift}deg off the ${anchor}deg anchor (max ${HUE_WANDER})`);
      }
    }
  }
}

// ----------------------------------------------------------------- harmony
// Triadic means exactly 120deg apart. This is the one claim in the design that
// is a number rather than a judgement, so it is checked as one.
for (const [a, b] of [["seeker", "recruiter"], ["recruiter", "admin"], ["admin", "seeker"]]) {
  const gap = hueDistance(anchors[a], anchors[b]);
  checks++;
  if (gap !== 120) {
    failures++;
    console.log(`FAIL  ${a} (${anchors[a]}deg) and ${b} (${anchors[b]}deg) are ${gap}deg apart — a triad is exactly 120`);
  }
}

// Portal identity and status meaning must never be confusable.
const light = scope("light", "seeker");
const statusHues = Object.fromEntries(
  ["danger", "warn", "ok"].map((name) => [name, resolve(light, `--${name}`).hue]),
);
for (const [portal, portalHue] of Object.entries(anchors)) {
  for (const [status, statusHue] of Object.entries(statusHues)) {
    const gap = hueDistance(portalHue, statusHue);
    checks++;
    if (gap < STATUS_GAP) {
      failures++;
      console.log(`FAIL  ${portal} (${portalHue}deg) is only ${gap}deg from ${status} (${statusHue}deg) — needs ${STATUS_GAP}`);
    }
  }
}

console.log(
  failures === 0
    ? `colour contrast: ${checks} checks pass (4.5:1 text, 3:1 UI, sRGB gamut, 120deg triad)`
    : `colour contrast: ${failures} of ${checks} checks failed`,
);
process.exit(failures === 0 ? 0 : 1);
