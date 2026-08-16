import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/initials";
import { cn } from "@/lib/utils";

type CompanyAvatarProps = {
  name?: string | null;
  logoUrl?: string | null;
  alt?: string;
  className?: ComponentProps<typeof Avatar>["className"];
};

/**
 * One visual contract for company identity across the board and workspaces.
 * Logos are contained on a neutral canvas so transparent marks survive both
 * themes; the fallback is intentionally branded rather than an empty circle.
 */
export function CompanyAvatar({ name, logoUrl, alt = "", className }: CompanyAvatarProps) {
  const companyName = name?.trim() || "Company";
  const decorative = alt.length === 0;

  return (
    <Avatar
      data-company-avatar=""
      aria-hidden={decorative ? true : undefined}
      className={cn("rounded-sharp border border-line bg-paper-raised shadow-sm", className)}
    >
      <AvatarImage
        key={logoUrl ?? "fallback"}
        src={logoUrl ?? undefined}
        alt={alt}
        className="bg-logo-canvas object-contain p-1.5"
      />
      <AvatarFallback className="relative rounded-sharp bg-signal-muted font-display text-sm font-semibold text-signal-text">
        <span aria-hidden="true" className="absolute inset-x-2 bottom-1.5 h-px bg-signal/45" />
        {initialsOf(companyName)}
      </AvatarFallback>
    </Avatar>
  );
}

export default CompanyAvatar;
