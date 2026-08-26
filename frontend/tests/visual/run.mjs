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
  ["jobs", "/jobs"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["hire", "/hire"],
  ["hire-login", "/hire/login"],
  ["hire-signup", "/hire/signup"],
  ["admin-login", "/admin/login"],
  // The invited admin's landing screen. Anonymous like every other route here,
  // and worth a frame of its own: it is the same form /reset-password renders
  // with different copy, so a variant that silently fell back to reset wording
  // would look correct in the route table and wrong on the page.
  ["admin-set-password", "/admin/set-password?email=newadmin%40example.test"],
  ["verify-email", "/verify-email?portal=seeker&email=demo%40example.test"],
  ["forgot-password", "/forgot-password?portal=seeker"],
  ["about", "/about"],
  ["contact", "/contact"],
  ["help", "/help"],
  ["updates", "/updates"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
];

async function waitForHeroMedia(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll("[data-hero-media] img")].every((image) => image.complete),
  );
}

// A screenshot of nothing is the one failure this harness could not see. Its three
// assertions — no console errors, the expected data-portal, no native radios — all
// pass on an empty page, so `light-workbench-recruiter.png` was a flat --paper
// rectangle for as long as it existed and the run reported success. Measured under
// the mocks below, /hire/jobs paints #root with three children and *zero* characters
// of text, no console error and no failed request; the guard does not redirect and
// nothing throws. Whether that is a gap in these mocks or a defect in the bootstrap
// is a question for a signed-in run against a live API — but either way the harness
// must refuse to record a blank frame rather than filing it as a pass.
//
// The floor is text, not pixels: a page whose shell renders and whose content does
// not is exactly the case a pixel diff would call "mostly fine".
async function assertPainted(page, label, minChars = 200) {
  const text = await page.evaluate(() => document.body.innerText.trim());
  if (text.length >= minChars) return 0;
  console.log(
    `FAIL  ${label}: painted only ${text.length} chars of text (needs ${minChars}) — the screenshot is blank or near-blank`,
  );
  return 1;
}

const JOBS = [
  {
    id: "job-1",
    title: "Senior Product Engineer",
    description: "Own customer-facing product work from discovery through delivery with a small cross-functional team.",
    requirements: ["React", "TypeScript", "Node.js"],
    salary: 34,
    experienceLevel: 5,
    location: "Bengaluru",
    jobType: "Full-time",
    position: "2 openings",
    remote: true,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    company: { id: "company-1", name: "Northstar Labs", description: null, website: null, location: "Bengaluru", logoUrl: "/images/companies/demo-northstar.svg", createdAt: new Date().toISOString() },
  },
  {
    id: "job-2",
    title: "Design Systems Lead",
    description: "Build the foundations, tools, and working agreements that help multiple product teams ship coherent interfaces.",
    requirements: ["Design systems", "Figma", "Accessibility"],
    salary: 29,
    experienceLevel: 6,
    location: "Mumbai",
    jobType: "Full-time",
    position: "1 opening",
    remote: false,
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    company: { id: "company-2", name: "Common Thread", description: null, website: null, location: "Mumbai", logoUrl: "/images/companies/demo-common-thread.svg", createdAt: new Date().toISOString() },
  },
  {
    id: "job-3",
    title: "Data Platform Engineer",
    description: "Shape reliable data products, improve observability, and make analytics faster for teams across the business.",
    requirements: ["Python", "SQL", "Data pipelines"],
    salary: 31,
    experienceLevel: 4,
    location: "Pune",
    jobType: "Full-time",
    position: "3 openings",
    remote: true,
    createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    company: { id: "company-3", name: "Fieldwork", description: null, website: null, location: "Pune", logoUrl: "/images/companies/demo-fieldwork.svg", createdAt: new Date().toISOString() },
  },
];

async function mockPublicJobs(page) {
  await page.route("**/api/v1/job/get**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/job\/get\/([^/]+)$/)?.[1];
    if (id) {
      const job = JOBS.find((item) => item.id === id) ?? JOBS[0];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, job }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, items: JOBS, total: JOBS.length, page: 1, pages: 1 }),
    });
  });
}

async function mockWorkbench(page, portal) {
  const user = {
    id: `${portal}-user`,
    portal,
    fullName: portal === "admin" ? "Mira Patel" : "Aarav Mehta",
    email: portal === "admin" ? "mira@cairn.test" : "aarav@northstar.test",
    emailVerified: true,
    avatarUrl: null,
    status: "active",
  };
  await page.addInitScript(({ portal }) => localStorage.setItem("jp.portal", portal), { portal });
  await page.route(`**/api/v1/${portal}/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, user }) }),
  );

  if (portal === "recruiter") {
    await page.route("**/api/v1/company/get**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          companies: [
            { id: "company-1", name: "Northstar Labs", description: "Product studio", website: "https://northstar.test", location: "Bengaluru", logoUrl: null, createdAt: new Date().toISOString() },
            { id: "company-2", name: "Common Thread", description: "Design practice", website: "https://commonthread.test", location: "Mumbai", logoUrl: null, createdAt: new Date().toISOString() },
          ],
        }),
      }),
    );
    await page.route("**/api/v1/job/getadminjobs**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, items: JOBS, total: JOBS.length, page: 1, pages: 1 }),
      }),
    );
  } else {
    await page.route("**/api/v1/admin/overview**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          recruiters: { pending: 4, active: 38, suspended: 2 },
          seekers: { total: 2841 },
          jobs: { total: 126 },
          companies: { total: 49 },
          applications: { total: 973 },
        }),
      }),
    );
  }
}

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
  // `reducedMotion: "reduce"` is determinism *and* an assertion. Every `Reveal`
  // on the page holds its children at opacity 0 until an observer fires, and the
  // atmosphere drifts on the shared clock — so a screenshot taken on a wall-clock
  // timeout could catch either mid-transition, and two runs would differ for
  // reasons that have nothing to do with a regression. Under reduced motion
  // `useInViewOnce` reports in-view immediately and index.css collapses the
  // ambient and parallax switches, so what these 18 shots capture is the
  // reduced-motion end state: the frame every one of these surfaces must be
  // correct in, and the one nobody would otherwise look at.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await mockPublicJobs(page);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);

  for (const [name, path] of ROUTES) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    if (path === "/" || path === "/hire") await waitForHeroMedia(page);
    await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });
    failures += await assertPainted(page, `${theme}/${name}`);

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

// Mobile product states are separate checks: the jobs board changes structure
// below md and the landing hero has a much tighter first viewport.
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  await mockPublicJobs(page);

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("theme", "light"));

  for (const [name, path] of [
    ["landing", "/"],
    ["hire", "/hire"],
    ["login", "/login"],
    ["hire-login", "/hire/login"],
    ["updates", "/updates"],
  ]) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    if (path === "/" || path === "/hire") await waitForHeroMedia(page);
    await page.screenshot({ path: `${OUT}/mobile-light-${name}.png`, fullPage: true });
    failures += await assertPainted(page, `mobile/${name}`);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      console.log(`FAIL  mobile/${name}: horizontal overflow of ${overflow}px`);
      failures++;
    }

    if (path === "/" || path === "/hire") {
      const menu = await page.getByRole("button", { name: "Open menu" }).boundingBox();
      if (!menu || menu.x < 0 || menu.x + menu.width > 390) {
        console.log(`FAIL  mobile/${name}: menu button is clipped`);
        failures++;
      }
    }
  }

  await page.goto(BASE + "/jobs", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/mobile-light-jobs.png`, fullPage: true });
  failures += await assertPainted(page, "mobile/jobs");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.screenshot({ path: `${OUT}/mobile-light-jobs-filters.png` });

  const real = [...new Set(errors)].filter(
    (e) => !/CORS|Network Error|ERR_FAILED|Failed to load resource/i.test(e),
  );
  if (real.length) {
    console.log(`FAIL  mobile: console errors\n  ${real.join("\n  ")}`);
    failures += real.length;
  }
  await ctx.close();
}

for (const [portal, path, name] of [
  ["recruiter", "/hire/jobs", "workbench-recruiter"],
  ["admin", "/admin/dashboard", "workbench-admin"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  await mockWorkbench(page, portal);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const blank = await assertPainted(page, `workbench-${portal}`);
  failures += blank;
  if (portal === "admin" && !blank) {
    await page.getByRole("button", { name: /invite admin/i }).click();
    await page.screenshot({ path: `${OUT}/light-admin-invite.png` });
    await page.getByRole("button", { name: /close/i }).click();
  }
  await page.screenshot({ path: `${OUT}/light-${name}.png`, fullPage: true });
  const real = [...new Set(errors)].filter(
    (e) => !/CORS|Network Error|ERR_FAILED|Failed to load resource/i.test(e),
  );
  if (real.length) {
    console.log(`FAIL  ${name}: console errors\n  ${real.join("\n  ")}`);
    failures += real.length;
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nvisual pass: OK" : `\nvisual pass: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
