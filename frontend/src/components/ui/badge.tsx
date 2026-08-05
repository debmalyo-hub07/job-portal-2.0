import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sharp border border-transparent px-2 py-0.5 font-mono text-xs font-medium whitespace-nowrap transition-colors duration-(--dur-fast) focus-visible:ring-[3px] focus-visible:ring-signal-ring [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper [a&]:hover:bg-ink/90",
        secondary: "bg-paper-sunken text-ink [a&]:hover:bg-paper-sunken/70",
        signal: "bg-signal-muted text-signal-text",
        outline: "border-line text-ink [a&]:hover:bg-paper-sunken",
        ghost: "[a&]:hover:bg-signal-muted",
        link: "text-signal-text underline-offset-4 [a&]:hover:underline",
        // Semantic badges: callers always pair these with an icon and a label —
        // colour is never the only channel (WCAG 1.4.1).
        ok: "bg-ok/15 text-ok",
        warn: "bg-warn/15 text-warn",
        danger: "bg-danger/15 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
