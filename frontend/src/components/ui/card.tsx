import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `interactive` is opt-in rather than the default because most cards in this app
 * are containers, not controls, and a container that lights up under the pointer
 * promises a click that never happens. Pass it wherever the whole card is a link
 * or a button.
 *
 * The hover reads on three channels at once — border, elevation and a 1px lift —
 * because no single one of them is enough on a light ground. The card sits on
 * --paper-raised, one step above the page, and in light mode that step is 1.12:1;
 * a background change subtle enough to stay tasteful there is not visible, which
 * is why this state is carried by the frame rather than the fill.
 */
function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive || undefined}
      className={cn(
        "rounded-surface border border-line bg-paper-raised text-ink shadow-[var(--elevate-1)]",
        interactive &&
          "transition-[border-color,box-shadow,translate] duration-(--dur-fast) hover:border-line-strong hover:shadow-[var(--elevate-2)] hover:-translate-y-px focus-within:border-signal focus-within:shadow-[var(--elevate-2)] active:translate-y-0 active:shadow-[var(--elevate-1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-display text-lg font-semibold", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-ink-muted", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
