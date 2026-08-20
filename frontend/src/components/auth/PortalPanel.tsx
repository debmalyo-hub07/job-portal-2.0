import { Check } from "lucide-react";
import type { Portal } from "@jobportal/shared";

import { usePublicJobCount } from "@/hooks/usePublicJobCount";
import { AUTH_COPY } from "./authCopy";

const PANEL_IMAGE: Record<Portal, string> = {
  seeker: "/images/cairn-seeker-hero.jpg",
  recruiter: "/images/cairn-hire-hero.jpg",
  admin: "/images/cairn-seeker-hero.jpg",
};

export function PortalPanel({ portal }: { portal: Portal }) {
  const copy = AUTH_COPY[portal];
  const { count, ready } = usePublicJobCount();

  return (
    <aside className="auth-visual relative hidden min-h-screen overflow-hidden bg-media-shade text-media-copy lg:flex lg:items-end lg:p-10 xl:p-14">
      <img
        src={PANEL_IMAGE[portal]}
        alt=""
        width="2400"
        height="1600"
        className="auth-visual__image absolute inset-0 size-full object-cover"
      />
      <div aria-hidden="true" className="auth-visual__veil absolute inset-0" />
      <div aria-hidden="true" className="auth-visual__wash absolute inset-0" />

      <div className="relative max-w-xl pb-4">
        <p className="text-xs font-semibold uppercase text-media-copy/65">
          {portal === "seeker" ? "Your search, organised" : portal === "recruiter" ? "Hiring, with signal" : "Platform operations"}
        </p>
        <p className="mt-4 font-display text-4xl font-semibold leading-[0.95] text-balance text-media-copy lg:text-6xl xl:text-[4.5rem]">
          {copy.headline}
        </p>
        <p className="mt-5 max-w-md text-base leading-7 text-media-copy/75">{copy.sub}</p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {copy.points.map((point) => (
            <li key={point} className="flex items-start gap-3 border-t border-media-copy/20 pt-3">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" />
              <span className="text-sm leading-6 text-media-copy/85">{point}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 min-h-7 text-sm text-media-copy/65">
          {!ready ? null : count !== null ? (
            <>
              <span className="font-mono text-base font-semibold text-media-copy">{count.toLocaleString()}</span>{" "}
              open roles right now
            </>
          ) : (
            copy.fallbackProof
          )}
        </p>
      </div>
    </aside>
  );
}
