import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { Portal } from "@jobportal/shared";
import { cn } from "@/lib/utils";

type ImageHeroProps = {
  portal: Extract<Portal, "seeker" | "recruiter">;
  src: string;
  alt: string;
  objectPosition?: string;
  mobileObjectPosition?: string;
  className?: string;
  children: ReactNode;
};

type HeroStyle = CSSProperties & {
  "--hero-image-position": string;
  "--hero-image-position-mobile": string;
};

/** The hero's box in viewport coordinates, measured for the pointer math. */
type Bounds = { left: number; top: number; width: number; height: number };

/**
 * Full-bleed photographic hero. The image remains the subject; the overlays
 * only tune contrast and add a low-frequency signal wash that follows pointer
 * position on a fine-pointer device.
 *
 * Pointer tracking writes CSS custom properties, and the write is deliberately
 * rAF-throttled. `pointermove` fires at the input device's rate — 120Hz and
 * more on a fine mouse, several events per frame — and writing style per event
 * both thrashes (the rect read follows the previous event's writes) and spends
 * main-thread time the browser would otherwise give to compositing the hero's
 * blend-mode layers. The handler only records the latest position and
 * schedules one write per frame, so a burst of moves costs a single write.
 *
 * The reticle itself is positioned by `--hero-cursor-x/y` through the `translate`
 * property (see index.css), never `top`/`left`: those are layout properties, and
 * updating them at pointer rate invalidates layout under a stack of soft-light
 * layers — the stutter this tracking used to show.
 */
export function ImageHero({
  portal,
  src,
  alt,
  objectPosition = "center",
  mobileObjectPosition = objectPosition,
  className,
  children,
}: ImageHeroProps) {
  const ref = useRef<HTMLElement | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const frame = useRef<number | null>(null);
  const bounds = useRef<Bounds | null>(null);

  // One write per frame at most, carrying the latest event's position.
  const writePointer = useCallback(() => {
    frame.current = null;
    const host = ref.current;
    const box = bounds.current;
    if (!host || !box) return;
    const { x, y } = pointer.current;
    host.style.setProperty("--hero-pointer-x", `${x * 100}%`);
    host.style.setProperty("--hero-pointer-y", `${y * 100}%`);
    host.style.setProperty("--hero-cursor-x", `${(x * box.width).toFixed(1)}px`);
    host.style.setProperty("--hero-cursor-y", `${(y * box.height).toFixed(1)}px`);
    host.style.setProperty("--hero-depth-x", `${((0.5 - x) * 12).toFixed(2)}px`);
    host.style.setProperty("--hero-depth-y", `${((0.5 - y) * 8).toFixed(2)}px`);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;
      const host = event.currentTarget;
      // Measure at most once per scroll/resize: reading the rect in every
      // event forces a synchronous layout after the previous event's writes.
      if (!bounds.current) {
        const rect = host.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        bounds.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
      const box = bounds.current;
      pointer.current = {
        x: (event.clientX - box.left) / box.width,
        y: (event.clientY - box.top) / box.height,
      };
      if (frame.current == null) {
        frame.current = requestAnimationFrame(writePointer);
      }
    },
    [writePointer],
  );

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    // Cancel rather than write: the position the frame was carrying is stale
    // the moment the pointer is gone, and re-applying it after the reset would
    // snap the reticle back on for a frame.
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const host = event.currentTarget;
    host.style.setProperty("--hero-pointer-x", "50%");
    host.style.setProperty("--hero-pointer-y", "50%");
    host.style.setProperty("--hero-depth-x", "0px");
    host.style.setProperty("--hero-depth-y", "0px");
    // The reticle needs no reset: it is invisible whenever the pointer is
    // outside the hero, so its resting coordinates are never on screen.
  }, []);

  useEffect(() => {
    // Scroll moves the hero under a stationary pointer and resize changes the
    // box the percentages are taken against; either way the cached box is stale.
    const invalidate = () => {
      bounds.current = null;
    };
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    return () => {
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const style: HeroStyle = {
    "--hero-image-position": objectPosition,
    "--hero-image-position-mobile": mobileObjectPosition,
  };

  return (
    <section
      ref={ref}
      data-hero-media={portal}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={style}
      className={cn("hero-media", className)}
    >
      <img
        src={src}
        alt={alt}
        width="2400"
        height="1600"
        fetchPriority="high"
        className="hero-media__image"
      />
      <div aria-hidden="true" className="hero-media__wash" />
      <div aria-hidden="true" className="hero-media__focus" />
      <div aria-hidden="true" className="hero-media__veil" />
      <div aria-hidden="true" className="hero-media__texture" />
      <div aria-hidden="true" className="hero-media__cursor" />
      <div aria-hidden="true" className="hero-media__edge" />
      {children}
    </section>
  );
}

export default ImageHero;
