import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirm an action that cannot be undone.
 *
 * Built on `Dialog` rather than adding Radix's AlertDialog: the two are near
 * identical, and the second package would ship a duplicate overlay, portal and
 * focus trap for the sake of one changed aria role. The role difference is
 * covered here — `role="alertdialog"` and the description wired through
 * `aria-describedby`, which is what makes a screen reader announce the
 * consequence and not only the title.
 *
 * `description` is required, not optional. A confirm dialog whose body is just
 * "Are you sure?" asks the user to approve something it declined to state, and
 * an optional prop is an invitation to ship exactly that.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Cancel first in the DOM so it is the first control a keyboard
              reaches, and last visually on a wide screen — `flex-col-reverse`
              on DialogFooter puts it below on mobile. The safe choice should
              never be the one Enter lands on by accident. */}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "signal"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmDialog;
