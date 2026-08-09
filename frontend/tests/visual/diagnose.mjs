/**
 * White-screen triage. Loads a running dev server in a real browser and reports
 * console errors, page errors, failed requests, and whether #root has children.
 *
 *   node tests/visual/diagnose.mjs [url]
 *
 * Not part of any suite — it needs a live server, and jsdom cannot reproduce the
 * failures it exists to find. Vitest resolves imports through Node while the
 * browser resolves through Rolldown, so a module that throws at import in the
 * browser can pass every jsdom test. That gap is exactly how the app shipped a
 * blank page with a green suite: `redux/store.ts` threw
 * `createWebStorage is not a function` and only a real browser could see it.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    console.log(`[console.${m.type()}] ${m.text()}`);
  }
});
page.on("pageerror", (e) => console.log(`[pageerror] ${e.stack ?? e.message}`));
page.on("requestfailed", (r) =>
  console.log(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`),
);
page.on("response", (r) => {
  if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
});

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
} catch (e) {
  console.log(`[goto failed] ${e.message}`);
}

const root = await page.evaluate(() => {
  const el = document.getElementById("root");
  return {
    exists: Boolean(el),
    childCount: el?.childElementCount ?? -1,
    innerText: (el?.innerText ?? "").slice(0, 600),
    htmlHead: (el?.innerHTML ?? "").slice(0, 600),
  };
});
console.log("---ROOT---");
console.log(JSON.stringify(root, null, 2));

await browser.close();
