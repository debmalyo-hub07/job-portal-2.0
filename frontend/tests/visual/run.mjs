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
  ["admin-login", "/admin/login"],
  ["verify-email", "/verify-email?portal=seeker&email=demo%40example.test"],
  ["forgot-password", "/forgot-password?portal=seeker"],
];

// Pre-3A workspace URLs. Anonymous, so the chain is two hops: the redirect
// rewrites /admin/* onto /hire/*, then ProtectedRoute bounces a signed-out
// visitor home. The end state is "/" — what matters here is that the browser
// does not REST on an /admin/* URL under the admin portal, which is what a
// missing redirect would look like. The intermediate /hire hop is asserted in
// tests/workspaceRoutes.test.tsx, where the guard is inert because
// useAuthBootstrap sits above the router.
const REDIRECTS = ["/admin/companies", "/admin/jobs/j1/applicants"];

/** The same three-way mapping portalForPath applies, on a segment boundary. */
function expectedPortal(path) {
  const pathname = path.split("?")[0];
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/hire" || pathname.startsWith("/hire/")) return "recruiter";
  return "seeker";
}

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
    const expected = expectedPortal(path);
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

  for (const from of REDIRECTS) {
    await page.goto(BASE + from, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const landed = new URL(page.url()).pathname;
    if (landed.startsWith("/admin")) {
      console.log(`FAIL  ${theme}: ${from} stayed on ${landed} — the redirect did not fire`);
      failures++;
    }
    // Whatever it lands on, it must not still be resolving the admin portal.
    const portal = await page.getAttribute("[data-portal]", "data-portal");
    if (portal === "admin") {
      console.log(`FAIL  ${theme}: ${from} rested on the admin portal at ${landed}`);
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
