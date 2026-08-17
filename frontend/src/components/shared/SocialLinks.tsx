import { Facebook, Github, Instagram, Linkedin, Twitter } from "lucide-react";

import { cn } from "@/lib/utils";

type SocialLink = {
  label: string;
  href: string;
  icon: typeof Linkedin;
};

const configuredLinks: Array<SocialLink | null> = [
  import.meta.env.VITE_SOCIAL_LINKEDIN_URL
    ? { label: "LinkedIn", href: import.meta.env.VITE_SOCIAL_LINKEDIN_URL, icon: Linkedin }
    : null,
  import.meta.env.VITE_SOCIAL_INSTAGRAM_URL
    ? { label: "Instagram", href: import.meta.env.VITE_SOCIAL_INSTAGRAM_URL, icon: Instagram }
    : null,
  import.meta.env.VITE_SOCIAL_FACEBOOK_URL
    ? { label: "Facebook", href: import.meta.env.VITE_SOCIAL_FACEBOOK_URL, icon: Facebook }
    : null,
  import.meta.env.VITE_SOCIAL_X_URL
    ? { label: "X / Twitter", href: import.meta.env.VITE_SOCIAL_X_URL, icon: Twitter }
    : null,
  {
    label: "GitHub",
    href: import.meta.env.VITE_SOCIAL_GITHUB_URL || "https://github.com/debmalyo-hub07",
    icon: Github,
  },
];

export const SOCIAL_LINKS = configuredLinks.filter((link): link is SocialLink => Boolean(link));

export function SocialLinks({ className }: { className?: string }) {
  if (SOCIAL_LINKS.length === 0) return null;

  return (
    <nav aria-label="Cairn on social media" className={cn("flex items-center gap-2", className)}>
      {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Cairn on ${label}`}
          title={label}
          className="grid size-10 place-items-center rounded-full border border-line-strong text-ink-muted transition-[color,border-color,background-color,transform] duration-(--dur-fast) hover:-translate-y-0.5 hover:border-signal hover:bg-signal-muted hover:text-signal-text focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
        >
          <Icon aria-hidden="true" className="size-4" />
        </a>
      ))}
    </nav>
  );
}
