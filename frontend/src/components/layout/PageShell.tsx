import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Density = "spacious" | "compact";
type Width = "narrow" | "default" | "wide";

const WIDTH: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

/**
 * The page container. Sets `data-density`, which is what the spacing custom
 * properties resolve from — the same mechanism `data-portal` uses for signal
 * colour, so a component reads `--space-card` and never asks which surface it
 * is on.
 *
 * Density follows the surface's job, not the portal: /hire is recruiter-scoped
 * but is a marketing page, so it runs spacious.
 */
export function PageShell({
  density = "spacious",
  width = "default",
  className,
  children,
}: {
  density?: Density;
  width?: Width;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-density={density} className="min-h-screen bg-paper text-ink">
      <div
        className={cn(
          "mx-auto px-6 pt-(--space-page-top) pb-(--space-section)",
          WIDTH[width],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
