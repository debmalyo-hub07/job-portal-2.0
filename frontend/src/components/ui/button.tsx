import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sharp text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-danger/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper shadow-[var(--elevate-1)] hover:bg-ink/90 hover:shadow-[var(--elevate-2)]",
        // The fill is --signal, not --signal-text: --signal is the portal's
        // identity colour and --signal-text is the darkened variant that only
        // exists to carry 4.5:1 as *type on paper*. Using the text grade as a
        // fill is what made the recruiter portal's primary button olive rather
        // than gold. --signal-edge gives the fill a 3:1 boundary, which the
        // light recruiter gold (L 0.80 against L 0.97 paper) cannot supply
        // itself; hover and pressed step toward --signal-fg's opposite so the
        // gesture never dips below the text floor mid-press.
        signal:
          "border border-signal-edge bg-signal text-signal-fg shadow-[var(--elevate-1)] hover:bg-signal-hover hover:shadow-[var(--elevate-2)] active:bg-signal-pressed",
        destructive:
          "bg-danger text-danger-fg hover:bg-danger-hover active:bg-danger-pressed",
        outline:
          "border border-line-strong bg-paper-raised hover:border-ink-muted hover:bg-paper-sunken",
        // --container is the 30% band: darker than paper in light, lighter in
        // dark, so the hover reads as pressure in both. The old
        // paper-sunken/70 faded back toward paper in light mode, which is the
        // wrong direction for a hover.
        secondary: "bg-paper-sunken text-container-ink hover:bg-container",
        ghost: "hover:bg-signal-muted",
        link: "text-signal-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-base has-[>svg]:px-4",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
