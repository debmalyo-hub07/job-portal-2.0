// WCAG contrast for the palette the app actually resolves at runtime.
//
// The previous check duplicated every token as a hardcoded oklch literal. A
// redesign could change index.css and leave this file green against colours the
// browser no longer painted. These probes read computed custom properties from
// the running app, so the check follows the product instead of a second palette.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const PORTALS = ["seeker", "recruiter", "admin"];
const THEMES = ["light", "dark"];

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });

const results = await page.evaluate(({ portals, themes }) => {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  document.body.append(probe);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const toRgb = (color, under = "#fff") => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = under;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2]];
  };
  const luminance = ([r, g, b]) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (foreground, background, backgroundUnder = "#fff") => {
    const backgroundRgb = toRgb(background, backgroundUnder);
    const resolvedBackground = `rgb(${backgroundRgb.join(" ")})`;
    const a = luminance(toRgb(foreground, resolvedBackground));
    const b = luminance(backgroundRgb);
    return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
  };
  const resolve = (name) => getComputedStyle(probe).getPropertyValue(name).trim();

  const checks = [];
  for (const theme of themes) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    const mediaShade = resolve("--media-shade");
    const mediaCopy = resolve("--media-copy");
    const mediaSurface = resolve("--media-surface");
    const mediaSurfaceInk = resolve("--media-surface-ink");
    checks.push(
      { label: `${theme}: media copy on photographic shade`, ratio: ratio(mediaCopy, mediaShade) },
      { label: `${theme}: media surface ink`, ratio: ratio(mediaSurfaceInk, mediaSurface) },
    );
    for (const portal of portals) {
      probe.dataset.portal = portal;
      const paper = resolve("--paper");
      const raised = resolve("--paper-raised");
      const mutedPanel = resolve("--signal-muted");
      const ink = resolve("--ink");
      const inkMuted = resolve("--ink-muted");
      const signalText = resolve("--signal-text");
      const signalForeground = resolve("--signal-fg");

      checks.push(
        { label: `${theme} ${portal}: ink on paper`, ratio: ratio(ink, paper) },
        { label: `${theme} ${portal}: muted ink on paper`, ratio: ratio(inkMuted, paper) },
        { label: `${theme} ${portal}: signal text on paper`, ratio: ratio(signalText, paper) },
        { label: `${theme} ${portal}: signal foreground on signal text`, ratio: ratio(signalForeground, signalText) },
        { label: `${theme} ${portal}: ink on raised surface`, ratio: ratio(ink, raised) },
        { label: `${theme} ${portal}: muted ink on signal panel`, ratio: ratio(inkMuted, mutedPanel, paper) },
      );
    }
  }

  probe.remove();
  return checks;
}, { portals: PORTALS, themes: THEMES });

await browser.close();

let failed = 0;
for (const result of results) {
  const passes = result.ratio >= 4.5;
  if (!passes) failed++;
  console.log(`${passes ? "PASS" : "FAIL"}  ${String(result.ratio).padStart(6)}:1  ${result.label}`);
}
console.log(`\n${results.length - failed}/${results.length} pairings clear 4.5:1`);
process.exit(failed === 0 ? 0 : 1);
