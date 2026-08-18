import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field whose value can be revealed.
 *
 * Typing a long password blind is where a sign-in fails for reasons that have
 * nothing to do with the password, so the reveal belongs to the primitive rather
 * than to whichever form remembered to add it. All four password fields in the
 * app route through here — sign-in, sign-up, reset, and the console's
 * provisioning key, where checking a pasted secret is the whole point.
 *
 * Two details that are easy to get wrong and silent when you do:
 *
 * `...props` lands on the input and never on the wrapper. `FormField` clones its
 * only child to inject `aria-describedby` and `aria-invalid`, so a wrapper that
 * absorbed them would leave every hint and error attached to a `<div>` — present
 * in the DOM, announced by nothing.
 *
 * The toggle is `type="button"`. A bare button inside a form submits it, so
 * revealing a password would have posted the form mid-typing.
 */
export function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [revealed, setRevealed] = React.useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        disabled={disabled}
        // Room for the toggle, so a long value never runs underneath it.
        className={cn("pr-11", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        // The name states what the control will do, not what the field is
        // currently doing: "Hide password" while the characters are visible is
        // the choice on offer, and the choice is what has to be announced.
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-controls={props.id}
        onClick={() => setRevealed((current) => !current)}
        className="absolute inset-y-0 right-1 my-auto text-ink-muted hover:text-ink"
      >
        <Icon aria-hidden="true" />
      </Button>
    </div>
  );
}
