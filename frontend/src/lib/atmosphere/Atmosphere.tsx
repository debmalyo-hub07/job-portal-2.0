import { useEffect, useRef, useState } from "react";

import { useShader } from "./canvasShader";
import { cn } from "@/lib/utils";

/**
 * A decorative ambient field, painted behind a section that opts into one.
 *
 * Deliberately NOT mounted by PageShell. Atmosphere page-wide would sit behind
 * every paragraph in the application, and the contrast budget does not allow
 * that: measured in Chrome, light-mode `--ink-muted` on `--paper` is 5.35:1,
 * only 0.85 over the WCAG 4.5:1 floor, and compositing the admin signal over
 * paper at alpha 0.15 lands on 4.39:1 — a fail. Capping the field low enough to
 * be universally safe would cap it at roughly alpha 0.10, which is close enough
 * to nothing that drawing it is not worth a GPU loop.
 *
 * So it is opt-in per section, sized by the caller, and masked in the shader to
 * vanish across the band where copy sits. A section that wants one places it and
 * takes responsibility for what sits on top.
 *
 * The amplitude comes from `--motion-ambient-amplitude`, resolved by whichever
 * ancestor set the motion tier — PageShell on most surfaces, Home.tsx directly on
 * the landing page, which owns a full-bleed layout instead of PageShell's
 * container. index.css collapses the underlying :root switch to 0 under
 * `prefers-reduced-motion`. A page never passes a number.
 *
 * Note the amplitude read is inherited custom-property resolution, which jsdom
 * does not implement — there it yields 0 regardless of tier. That is why the
 * amplitude is verified in a real browser (tests/visual) and the jsdom suite
 * asserts only the guards: no context when paused, no subscription without a
 * signal colour.
 */
export function Atmosphere({
  className,
  textBand = [0.35, 0.62],
}: {
  className?: string;
  /**
   * Where copy sits, as a [start, end] fraction from the top of the layer. The
   * field is masked to zero across it. The default clears a hero's headline and
   * supporting paragraph.
   */
  textBand?: [number, number];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  // False until something proves otherwise. jsdom's IntersectionObserver stub
  // never fires, so tests keep this at zero and never open a clock subscription
  // — which is what keeps `motionClock.test.ts`'s exact subscriber counts
  // honest across every suite that renders a page carrying an Atmosphere.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: "10% 0px" },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  // Read the resolved tier amplitude rather than branching on the surface. The
  // value is a number in a custom property, so it is read once on mount and
  // whenever visibility flips — not per frame.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const raw = getComputedStyle(host).getPropertyValue("--motion-ambient-amplitude");
    const value = Number.parseFloat(raw);
    setAmplitude(Number.isFinite(value) ? value : 0);
  }, [visible]);

  useShader(canvasRef, amplitude, textBand, visible);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-paper", className)}
    >
      <canvas ref={canvasRef} className="size-full opacity-70" />
    </div>
  );
}
