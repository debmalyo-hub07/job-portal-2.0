import { chromium } from "playwright";

/**
 * Throwaway verification of the paths the jsdom suite and the reduced-motion
 * visual run both structurally cannot reach:
 *   - a Reveal below the fold actually starts hidden and ends visible
 *   - the same element is visible immediately under reduced motion
 *   - NumberFlow upgrades in a real browser rather than taking the fallback
 *   - the LCP element is the heading, not the canvas
 *   - no console errors on the surfaces that gained an Atmosphere
 */
const BASE = "http://localhost:5173";
let bad = 0;
const fail = (m) => { console.log("FAIL " + m); bad++; };
const ok = (m) => console.log("ok   " + m);

const browser = await chromium.launch({ channel: "chrome" });

// ---- 1. Reveal, motion enabled -------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto(BASE + "/about", { waitUntil: "load" });
  await page.waitForTimeout(600);

  const last = page.locator("[data-reveal]").last();
  const before = await last.evaluate((el) => getComputedStyle(el).opacity);
  if (before === "1") fail(`/about last reveal was already visible before scrolling (opacity ${before})`);
  else ok(`/about last reveal starts hidden (opacity ${before})`);

  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const after = await last.evaluate((el) => getComputedStyle(el).opacity);
  if (after !== "1") fail(`/about reveal never arrived (opacity ${after} after scroll)`);
  else ok("/about reveal arrives on scroll (opacity 1)");

  // The offset must resolve to a real distance on an ambient surface.
  const dist = await last.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--motion-reveal-distance").trim(),
  );
  if (dist !== "24px") fail(`--motion-reveal-distance resolved to "${dist}", expected 24px`);
  else ok("--motion-reveal-distance resolves to 24px on the ambient tier");

  if (errors.length) fail(`/about console errors: ${errors.join(" | ")}`);
  else ok("/about clean console");
  await ctx.close();
}

// ---- 2. Reveal, reduced motion ------------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/about", { waitUntil: "load" });
  await page.waitForTimeout(500);

  const last = page.locator("[data-reveal]").last();
  const opacity = await last.evaluate((el) => getComputedStyle(el).opacity);
  if (opacity !== "1") fail(`reduced motion left a reveal hidden (opacity ${opacity})`);
  else ok("reduced motion: every reveal visible without scrolling");

  const dist = await last.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--motion-reveal-distance").trim(),
  );
  if (dist !== "0px") fail(`reduced motion left the offset at "${dist}"`);
  else ok("reduced motion: offset collapsed to 0px");
  await ctx.close();
}

// ---- 3. The response tier caps the offset -------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/hire", { waitUntil: "load" });
  await page.waitForTimeout(400);
  const dist = await page.locator("[data-motion]").first().evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--motion-reveal-distance").trim(),
  );
  if (dist !== "24px") fail(`/hire is meant to be ambient, offset resolved "${dist}"`);
  else ok("/hire runs the ambient offset (24px) — it had no tier at all before");
  await ctx.close();
}

// ---- 4. NumberFlow's own capability predicate, in a real browser ---------
// The board needs a live API to render a count, so rather than skip this,
// evaluate the exact predicate `number-flow` gates on:
//   canAnimate = supportsMod && supportsLinear && supportsAtProperty
// If this were false in Chrome, `AnimatedNumber` would take its fallback branch
// everywhere and the dependency would buy nothing.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  const caps = await page.evaluate(() => {
    const supportsLinear = (() => {
      try {
        document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
      } catch {
        return false;
      }
      return true;
    })();
    const supportsMod =
      typeof CSS !== "undefined" && CSS.supports && CSS.supports("line-height", "mod(1,1)");
    const supportsAtProperty = (() => {
      try {
        CSS.registerProperty({
          name: "--probe-number-flow",
          syntax: "<number>",
          inherits: false,
          initialValue: "0",
        });
        return true;
      } catch {
        return false;
      }
    })();
    return { supportsLinear, supportsMod, supportsAtProperty };
  });
  const canAnimate = caps.supportsLinear && caps.supportsMod && caps.supportsAtProperty;
  if (!canAnimate)
    fail(`number-flow cannot animate in this browser: ${JSON.stringify(caps)} — AnimatedNumber would always fall back`);
  else ok("number-flow's canAnimate predicate is true in Chrome, so counts really animate");
  await ctx.close();
}

// ---- 5. LCP is the heading, not the canvas ------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Register the observer before navigating and read it buffered — querying
  // getEntriesByType after the fact returned nothing.
  await page.addInitScript(() => {
    window.__lcp = null;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lcp = { tag: e.element ? e.element.tagName : "?", time: Math.round(e.startTime) };
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  // LCP is only finalised on interaction or page hide; a click settles it.
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  const lcp = await page.evaluate(() => window.__lcp);
  if (!lcp) fail("no LCP entry reported at all — the check cannot vouch for anything");
  else if (lcp.tag === "CANVAS")
    fail(`LCP element is the canvas (${lcp.time}ms) — the shader is beating the copy to first paint`);
  else ok(`LCP element is <${lcp.tag}> at ${lcp.time}ms, not the canvas`);
  await ctx.close();
}

await browser.close();
console.log(bad === 0 ? "\nmotion pass: OK" : `\nmotion pass: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
