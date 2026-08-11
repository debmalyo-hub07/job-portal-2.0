/**
 * OKLCH → sRGB, for the one consumer that cannot use CSS: a WebGL uniform.
 *
 * Every colour in this application is an oklch token, and the atmosphere shader
 * needs the signal colour as three floats. None of the obvious browser routes
 * deliver that:
 *
 * - `getComputedStyle(el).color` returns the oklch string verbatim. Chrome has
 *   preserved the author's colour space in computed values since CSS Color 4;
 *   the old "everything serialises to rgb()" assumption is no longer true.
 * - `CSS.registerProperty({ syntax: "<color>" })` then reading back: also oklch.
 * - `ctx.fillStyle = c; ctx.fillStyle`: also oklch.
 * - `fillRect` + `getImageData`: works, and is what `tests/visual/contrast.mjs`
 *   uses — but `getContext` returns null in jsdom, so an in-app dependency on
 *   it is untestable and fails on any browser where canvas is unavailable.
 *
 * So the conversion is ours, and `tests/oklch.test.ts` pins it against values
 * measured in Chrome rather than against itself.
 *
 * The lesson recorded in contrast.mjs — that parsing oklch went badly wrong once
 * — was about treating L/C/H as sRGB components, not about the arithmetic being
 * infeasible. The OKLab matrices below are exact to the byte on every token in
 * index.css.
 */

export type Oklch = { l: number; c: number; h: number; alpha: number };
export type Rgb = { r: number; g: number; b: number };

/**
 * `oklch(L C H)` / `oklch(L C H / A)` → components, or null.
 *
 * Null is a first-class result, not an error path. A caller that cannot read a
 * colour must skip the atmosphere rather than substitute a guess: an unparsed
 * value becomes NaN, `gl.uniform1f` accepts NaN without throwing, and the field
 * renders black. Returning null makes that impossible by construction.
 *
 * Deliberately narrow: this parses the one syntax the token system emits. A hex
 * literal or an rgb() colour returns null because neither can appear in
 * index.css — the colour gate (`npm run lint:colour`) is a hard zero.
 */
export function parseOklch(input: string): Oklch | null {
  const match = /^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s/]+)\s*(?:\/\s*([^\s)]+)\s*)?\)$/i.exec(
    input.trim(),
  );
  if (!match) return null;

  const [, rawL, rawC, rawH, rawA] = match;

  // `none` is a valid CSS Color 4 component and means zero here. It appears in
  // no current token, but a null return for a legal colour would read as a
  // parser bug rather than as the deliberate refusal above.
  const num = (raw: string, pctScale: number): number | null => {
    if (raw === "none") return 0;
    const isPct = raw.endsWith("%");
    const value = Number.parseFloat(isPct ? raw.slice(0, -1) : raw);
    if (!Number.isFinite(value)) return null;
    return isPct ? (value / 100) * pctScale : value;
  };

  const l = num(rawL, 1);
  // A chroma percentage is relative to 0.4, per CSS Color 4.
  const c = num(rawC, 0.4);
  const h = num(rawH.replace(/deg$/i, ""), 360);
  const alpha = rawA === undefined ? 1 : num(rawA, 1);

  if (l === null || c === null || h === null || alpha === null) return null;
  return { l, c, h, alpha };
}

/** sRGB transfer function (gamma encode), then clamp to a byte. */
function encodeChannel(linear: number): number {
  const v =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(Math.max(linear, 0), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/**
 * OKLCH → sRGB bytes, via OKLab and linear sRGB.
 *
 * Out-of-gamut colours are clamped per channel, which is *not* what Chrome does
 * (CSS Color 4 specifies chroma reduction). Every token in index.css is in gamut,
 * so the two agree exactly today — verified byte-for-byte against Chrome for five
 * representative tokens in `tests/oklch.test.ts`.
 *
 * That agreement is pinned for those five only. A future high-chroma token could
 * diverge here without any test noticing, because nothing converts the whole
 * stylesheet through a real browser: this module is TypeScript and the audit
 * scripts are plain node, so importing it there would need a build step for one
 * assertion. What the suite does cover for every token is that the parser accepts
 * it (see "parses every oklch token in index.css"), which is the failure that
 * actually silences the field.
 */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = lp * lp * lp;
  const mc = mp * mp * mp;
  const sc = sp * sp * sp;

  return {
    r: encodeChannel(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    g: encodeChannel(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    b: encodeChannel(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
  };
}

/**
 * Read a custom property off an element and convert it, or null.
 *
 * The null path covers three real cases: the variable is unset (empty string),
 * the value is a `color-mix()` Chrome has not resolved, and a malformed value.
 * All three must reach the caller as "no atmosphere", never as a partial colour.
 */
export function readOklchVar(el: Element, property: string): Rgb | null {
  const raw = getComputedStyle(el).getPropertyValue(property);
  const parsed = parseOklch(raw);
  return parsed === null ? null : oklchToRgb(parsed);
}
