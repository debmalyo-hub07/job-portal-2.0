// WCAG contrast for the token pairings this slice introduces.
//
// Colours are resolved through a real browser colour pipeline, NOT by parsing
// oklch() components as if they were sRGB channels — that mistake produced a
// confident 2.42:1 for a pairing that actually measures 9.08:1 during the
// design investigation, and nearly put a non-existent bug into the spec.
//
// Translucent surfaces are modelled with `color-mix(in srgb, ...)`, never
// `in oklch`. Measured in Chrome, compositing the seeker signal over paper at 12%
// gives 235,234,247 — a cool lilac. `color-mix(in oklch, ...)` returns
// 246,233,217, a warm beige: the hue interpolates the long way round the circle
// toward achromatic paper and lands somewhere the browser never paints. `in srgb`
// matches real source-over compositing to within 1/255.
//
// This file used `in oklch` for all twelve panel pairings until 2026-08-11. No
// verdict changed when it was corrected — the wrong colours happened to sit at
// similar luminance, so every pairing passed both ways (the true ratios are up to
// 0.25 lower; the tightest is now 4.56:1). It was right for the wrong reason,
// which is not a property to leave load-bearing.
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
  ["light --ink on seeker panel", "oklch(0.18 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 282) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink on seeker panel", "oklch(0.96 0.004 95)", "color-mix(in srgb, oklch(0.72 0.17 282) 18%, oklch(0.165 0.006 95))"],
  ["light --ink-muted on seeker panel", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 282) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted on seeker panel", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.72 0.17 282) 18%, oklch(0.165 0.006 95))"],
  ["light --ink on recruiter panel", "oklch(0.18 0.008 95)", "color-mix(in srgb, oklch(0.60 0.13 185) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink on recruiter panel", "oklch(0.96 0.004 95)", "color-mix(in srgb, oklch(0.74 0.13 185) 18%, oklch(0.165 0.006 95))"],
  ["light --ink-muted on recruiter panel", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.60 0.13 185) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted on recruiter panel", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.74 0.13 185) 18%, oklch(0.165 0.006 95))"],
  // Admin (hue 330), added in Phase 3A. Same six shapes as recruiter.
  ["light admin --signal-text on --paper", "oklch(0.45 0.19 330)", "oklch(0.99 0.004 95)"],
  ["dark admin --signal-text on --paper", "oklch(0.80 0.15 330)", "oklch(0.165 0.006 95)"],
  ["light --signal-fg on --signal-text (admin)", "oklch(0.99 0.004 95)", "oklch(0.45 0.19 330)"],
  ["dark --signal-fg on --signal-text (admin)", "oklch(0.165 0.006 95)", "oklch(0.80 0.15 330)"],
  ["light --ink on admin panel", "oklch(0.18 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 330) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink on admin panel", "oklch(0.96 0.004 95)", "color-mix(in srgb, oklch(0.72 0.17 330) 18%, oklch(0.165 0.006 95))"],
  ["light --ink-muted on admin panel", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 330) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted on admin panel", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.72 0.17 330) 18%, oklch(0.165 0.006 95))"],

  // The ambient field (lib/atmosphere), at the 0.12 ceiling hardcoded in its
  // fragment shader. These rows are what justify that number: --ink-muted is the
  // tightest pairing in the system at 5.35:1 on bare paper, only 0.85 over the
  // floor, so it is the one the field can break. Raising the ceiling must keep
  // every row here passing — at 0.18 the light seeker and admin rows fail
  // (4.26:1 and 4.20:1), which is how close 0.12 sits to the real boundary.
  //
  // The shader masks the field to zero across the copy band, so in practice body
  // text sits on unmodified paper. These rows deliberately ignore that mask and
  // ask the harder question: if a caller mis-sizes its textBand and copy lands in
  // the field at full strength, does it still clear 4.5:1? It must.
  ["light --ink-muted over seeker field", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 282) 12%, oklch(0.99 0.004 95))"],
  ["light --ink-muted over recruiter field", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.60 0.13 185) 12%, oklch(0.99 0.004 95))"],
  ["light --ink-muted over admin field", "oklch(0.52 0.008 95)", "color-mix(in srgb, oklch(0.58 0.19 330) 12%, oklch(0.99 0.004 95))"],
  ["dark --ink-muted over seeker field", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.72 0.17 282) 12%, oklch(0.165 0.006 95))"],
  ["dark --ink-muted over recruiter field", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.74 0.13 185) 12%, oklch(0.165 0.006 95))"],
  ["dark --ink-muted over admin field", "oklch(0.68 0.006 95)", "color-mix(in srgb, oklch(0.72 0.17 330) 12%, oklch(0.165 0.006 95))"],
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
