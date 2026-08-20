import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sharp border border-line-strong bg-paper-raised px-3.5 py-2 text-base text-ink transition-[border-color,box-shadow,background-color] duration-(--dur-fast) outline-none selection:bg-signal-muted file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        // Disabled inputs already carry `pointer-events-none` above, so hover
        // cannot fire on them and needs no separate guard.
        "hover:border-ink-muted",
        "focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-signal-ring",
        "aria-invalid:border-danger aria-invalid:ring-danger/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
