import { MoreHorizontal } from "lucide-react";
import { RECRUITER_SETTABLE } from "@jobportal/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusMeta } from "@/lib/applicationStatus";

type SettableStatus = (typeof RECRUITER_SETTABLE)[number];

/**
 * One application's decision menu.
 *
 * Shared by the table rows and the small-screen cards, because those are two
 * renderings of the same list and a menu that drifted between them would be a
 * menu that behaves differently depending on the width of the window. Built
 * from RECRUITER_SETTABLE, so it cannot offer a move the API would refuse;
 * the current status is omitted — setting it again is a 409 by design.
 */
export function DecisionMenu({
  fullName,
  current,
  onDecide,
  trigger = "icon",
}: {
  fullName: string;
  current: string;
  onDecide: (next: SettableStatus) => void;
  /** The table's icon trigger, or the card's labelled one. */
  trigger?: "icon" | "labelled";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="ghost" size="sm" aria-label={`Change status for ${fullName}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label={`Change status for ${fullName}`}>
            Change status
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {RECRUITER_SETTABLE.filter((next) => next !== current).map((next) => {
          const meta = statusMeta(next);
          const NextIcon = meta.Icon;
          return (
            <DropdownMenuItem key={next} onSelect={() => onDecide(next)}>
              <NextIcon className="size-4" />
              {meta.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default DecisionMenu;
