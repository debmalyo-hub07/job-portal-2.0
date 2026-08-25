import { CircleCheck, CircleSlash, type LucideIcon } from "lucide-react";
import type { JobStatus } from "@jobportal/shared";

import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

/**
 * How a posting's lifecycle status reads.
 *
 * Separate from `applicationStatus.ts` on purpose: these describe a *job*, and
 * the words differ from the candidate's side even where a value looks similar.
 * Merging them would put "Not selected" and "Closed" in one map keyed by two
 * unrelated enums.
 *
 * Icon and label always travel with the variant, never colour alone (WCAG
 * 1.4.1). `open` deliberately has no badge in the table — see `jobStatusMeta`.
 */
export const JOB_STATUS_META: Record<
  JobStatus,
  { variant: BadgeVariant; Icon: LucideIcon; label: string; description: string }
> = {
  open: {
    variant: "outline",
    Icon: CircleCheck,
    label: "Open",
    description: "This role is on the job board and accepting applications.",
  },
  closed: {
    variant: "secondary",
    Icon: CircleSlash,
    label: "Closed",
    description: "This role has left the job board and is not accepting applications.",
  },
};

/**
 * Presentation for a status string off the wire.
 *
 * Falls back to `open`, matching the API: a job row written before the field
 * existed has no status at all and the board treats it as open, so a value this
 * build does not recognise reads the same way rather than rendering nothing.
 */
export function jobStatusMeta(status: string) {
  return JOB_STATUS_META[status as JobStatus] ?? JOB_STATUS_META.open;
}
