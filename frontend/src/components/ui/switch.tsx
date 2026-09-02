"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * A real on/off control — a kill switch wants a switch, not a button whose
 * label changes. Radix supplies the semantics (role="switch", aria-checked,
 * Space toggling); the tokens supply the look: the track takes the signal
 * colour only when checked, so the platform's posture is legible at a glance,
 * and the focus ring matches every other control in the system.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-paper-sunken transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-signal data-[state=checked]:bg-signal",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4.5 rounded-full bg-paper transition-transform duration-(--dur-fast) data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
