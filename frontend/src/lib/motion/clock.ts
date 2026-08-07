/**
 * The single rAF loop the whole motion system shares. Spec §1's "one clock"
 * success criterion is a property of the runtime, not a discipline: the
 * shader, the canvas, the scroll narrative and the number counters all
 * subscribe here, so no two of them can drift apart between frames.
 *
 * The loop runs only while there is at least one subscriber and the document
 * is visible; the last unsubscribe (or a background tick) stops the rAF chain
 * so a page with nothing animated costs zero frames. `dt` is clamped so a
 * backgrounded tab resuming does not hand physics a multi-second jump.
 */

const MAX_DT_MS = 50;

type Subscriber = (dt: number, elapsed: number) => void;

const subscribers = new Set<Subscriber>();
let rafId: number | null = null;
let lastTime = 0;
let elapsed = 0;

function tick(now: number): void {
  const dt = Math.min(now - lastTime, MAX_DT_MS);
  lastTime = now;
  elapsed += dt;
  for (const cb of subscribers) {
    cb(dt, elapsed);
  }
  // Keep looping while anyone is listening and the tab is visible.
  if (subscribers.size > 0 && !document.hidden) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
}

function start(): void {
  if (rafId !== null || document.hidden) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function onVisibility(): void {
  if (document.hidden) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else if (subscribers.size > 0) {
    start();
  }
}

let visibilityBound = false;
function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  document.addEventListener("visibilitychange", onVisibility);
  visibilityBound = true;
}

/**
 * Subscribes to the shared clock. Returns the unsubscribe function; calling it
 * when it is the last subscriber stops the rAF loop. Re-subscribing after the
 * count reaches zero starts a fresh loop.
 */
export function subscribe(cb: Subscriber): () => void {
  bindVisibility();
  subscribers.add(cb);
  start();
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

/** How many subscribers the clock is currently driving. Test seam. */
export function subscriberCount(): number {
  return subscribers.size;
}
