import {
  CalendarCheck,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  Star,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { ApplicationStatus } from "@jobportal/shared";

import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

/**
 * How each pipeline stage reads.
 *
 * ONE map, imported by both the seeker's timeline and the recruiter's applicant
 * table. Those two kept private copies of a three-status map, which is the shape
 * of bug the `homePathFor` note describes: five inline copies of a mapping hid a
 * defect in one of them. A stage added to the enum now renders identically on
 * both sides or fails to compile on neither.
 *
 * Every entry pairs an icon AND a label with its variant, never colour alone
 * (WCAG 1.4.1) — the rule 2A set and the semantic badge comment restates. Two
 * in-progress stages deliberately share `signal`: the icon and label separate
 * them, and inventing a token per stage would spend the palette on a
 * distinction the text already makes.
 */
export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { variant: BadgeVariant; Icon: LucideIcon; label: string; description: string }
> = {
  applied: {
    variant: "outline",
    Icon: Clock,
    label: "Applied",
    description: "Your application has been received.",
  },
  reviewed: {
    variant: "secondary",
    Icon: Eye,
    label: "Reviewed",
    description: "The hiring team has opened your application.",
  },
  shortlisted: {
    variant: "signal",
    Icon: Star,
    label: "Shortlisted",
    description: "You are on the shortlist for this role.",
  },
  interview: {
    variant: "signal",
    Icon: CalendarCheck,
    label: "Interview",
    description: "The team wants to interview you.",
  },
  offered: {
    variant: "ok",
    Icon: CircleCheck,
    label: "Offered",
    description: "You have an offer for this role.",
  },
  rejected: {
    variant: "danger",
    Icon: CircleX,
    label: "Not selected",
    description: "This application will not move forward.",
  },
  withdrawn: {
    variant: "secondary",
    Icon: Undo2,
    label: "Withdrawn",
    description: "You withdrew this application.",
  },
};

/**
 * Presentation for a status string off the wire.
 *
 * Falls back to `applied` rather than throwing: a value this build does not know
 * means the API is ahead of the bundle, and a job list that renders one odd
 * badge is a better failure than a page that will not render at all.
 */
export function statusMeta(status: string) {
  return APPLICATION_STATUS_META[status as ApplicationStatus] ?? APPLICATION_STATUS_META.applied;
}
