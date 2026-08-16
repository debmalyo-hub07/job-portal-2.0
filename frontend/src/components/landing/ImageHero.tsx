import {
  useCallback,
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

/**
 * Full-bleed photographic hero. The image remains the subject; the overlays
 * only tune contrast and add a low-frequency signal wash that follows pointer
 * position on a fine-pointer device.
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

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const host = event.currentTarget;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    host.style.setProperty("--hero-pointer-x", `${x * 100}%`);
    host.style.setProperty("--hero-pointer-y", `${y * 100}%`);
    host.style.setProperty("--hero-depth-x", `${((0.5 - x) * 12).toFixed(2)}px`);
    host.style.setProperty("--hero-depth-y", `${((0.5 - y) * 8).toFixed(2)}px`);
  }, []);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--hero-pointer-x", "50%");
    event.currentTarget.style.setProperty("--hero-pointer-y", "50%");
    event.currentTarget.style.setProperty("--hero-depth-x", "0px");
    event.currentTarget.style.setProperty("--hero-depth-y", "0px");
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
