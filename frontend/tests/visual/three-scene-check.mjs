import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const ROUTES = [
  { path: "/", portal: "seeker" },
  { path: "/hire", portal: "recruiter" },
];

let failures = 0;
const fail = (message) => {
  console.log(`FAIL ${message}`);
  failures += 1;
};
const pass = (message) => console.log(`ok   ${message}`);

async function mockPublicJobs(page) {
  await page.route("**/api/v1/job/get**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, items: [], total: 0, page: 1, pages: 0 }),
    }),
  );
}

async function waitForScene(page, portal) {
  const scene = page.locator(`[data-cairn-scene="${portal}"]`);
  await scene.waitFor({ state: "attached" });
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("data-canvas-ready") === "true",
    `[data-cairn-scene="${portal}"]`,
  );
  return scene;
}

async function probeCanvas(scene) {
  return scene.locator("canvas").evaluate((canvas) => {
    const width = canvas.width;
    const height = canvas.height;
    let pixels;
    let mode = "webgl2";
    const gl = canvas.getContext("webgl2");

    if (gl) {
      pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      mode = "2d";
      const context = canvas.getContext("2d", { willReadFrequently: true });
      pixels = context?.getImageData(0, 0, width, height).data ?? new Uint8ClampedArray();
    }

    const pixelCount = Math.floor(pixels.length / 4);
    const step = Math.max(1, Math.floor(pixelCount / 60_000));
    let nonblank = 0;
    let hash = 2166136261;
    for (let pixel = 0; pixel < pixelCount; pixel += step) {
      const offset = pixel * 4;
      if (pixels[offset + 3] > 3) nonblank += 1;
      hash ^= pixels[offset];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 1];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 2];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 3];
      hash = Math.imul(hash, 16777619);
    }

    return { width, height, nonblank, hash: hash >>> 0, mode };
  });
}

async function probeLayout(page, portal) {
  return page.evaluate((value) => {
    const stage = document.querySelector(`[data-cairn-stage="${value}"]`);
    const copy = document.querySelector(`[data-hero-copy="${value}"]`);
    const section = stage?.closest("section");
    if (!stage || !copy || !section) return null;

    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    };
    const stageRect = rect(stage);
    const copyRect = rect(copy);
    const sectionRect = rect(section);
    const overlapWidth = Math.max(
      0,
      Math.min(stageRect.right, copyRect.right) - Math.max(stageRect.left, copyRect.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(stageRect.bottom, copyRect.bottom) - Math.max(stageRect.top, copyRect.top),
    );

    return {
      overlapArea: overlapWidth * overlapHeight,
      copyInsideViewport: copyRect.left >= 0 && copyRect.right <= window.innerWidth,
      stageInsideHero:
        stageRect.top >= sectionRect.top - 1 && stageRect.bottom <= sectionRect.bottom + 1,
    };
  }, portal);
}

const browser = await chromium.launch({ channel: "chrome" });

for (const viewport of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  for (const route of ROUTES) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await mockPublicJobs(page);
    await page.goto(BASE + route.path, { waitUntil: "domcontentloaded" });

    const scene = await waitForScene(page, route.portal);
    const before = await probeCanvas(scene);
    if (before.width <= 1 || before.height <= 1 || before.nonblank < 40) {
      fail(`${viewport.label} ${route.portal}: canvas is blank or incorrectly sized`);
    } else {
      pass(
        `${viewport.label} ${route.portal}: ${before.mode} canvas ${before.width}x${before.height} is nonblank`,
      );
    }

    const layout = await probeLayout(page, route.portal);
    if (!layout) {
      fail(`${viewport.label} ${route.portal}: hero layout probes are missing`);
    } else if (!layout.copyInsideViewport || !layout.stageInsideHero || layout.overlapArea > 1) {
      fail(`${viewport.label} ${route.portal}: scene or copy framing is invalid ${JSON.stringify(layout)}`);
    } else {
      pass(`${viewport.label} ${route.portal}: scene is framed without obscuring hero copy`);
    }

    const progressBefore = Number(await scene.getAttribute("data-scene-progress"));
    await page.evaluate(() => window.scrollBy(0, Math.min(260, window.innerHeight * 0.3)));
    await page.waitForTimeout(350);
    const progressAfter = Number(await scene.getAttribute("data-scene-progress"));
    const after = await probeCanvas(scene);
    if (Math.abs(progressAfter - progressBefore) < 0.01) {
      fail(`${viewport.label} ${route.portal}: scroll progress did not reach the scene`);
    } else if (after.hash === before.hash) {
      fail(`${viewport.label} ${route.portal}: scroll did not change the retained canvas frame`);
    } else {
      pass(`${viewport.label} ${route.portal}: scroll advances and repaints the cairn narrative`);
    }

    await context.close();
  }
}

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await mockPublicJobs(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const scene = await waitForScene(page, "seeker");
  const progress = await scene.getAttribute("data-scene-progress");
  const first = await probeCanvas(scene);
  await page.waitForTimeout(500);
  const second = await probeCanvas(scene);

  if (progress !== "1.000") {
    fail(`reduced motion: expected assembled progress 1.000, received ${progress}`);
  } else if (first.hash !== second.hash) {
    fail("reduced motion: the final cairn frame continued animating");
  } else {
    pass("reduced motion: the assembled final frame is stable");
  }
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\nthree scene pass: OK" : `\nthree scene pass: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
