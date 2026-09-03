import { Check } from "lucide-react";
import type { Portal } from "@jobportal/shared";

import { Atmosphere } from "@/lib/atmosphere/Atmosphere";
import { usePublicJobCount } from "@/hooks/usePublicJobCount";
import { AUTH_COPY } from "./authCopy";

const PANEL_IMAGE: Record<Portal, string | null> = {
  seeker: "/images/cairn-seeker-hero.jpg",
  recruiter: "/images/cairn-hire-hero.jpg",
  // Admin renders the Atmosphere field, not a photograph. Two reasons, and the
  // first is the bug this fixes: the panel used to point at the seeker hero,
  // so the rose portal's only face was the candidates' photo washed rose —
  // one image doing four jobs across the app, and none of them admin's. The
  // second is what the console is: oversight, not a story about people at
  // work. A slow signal field on the dark media ground says "system" where a
  // photograph would say "workplace", and it is the one portal whose identity
  // is better served by the abstraction than by a picture of someone else's
  // team. It also gains the larger measured budget of the media ground (see
  // shader.ts), so the rose actually reads at panel scale.
  admin: null,
};

export function PortalPanel({ portal }: { portal: Portal }) {
  const copy = AUTH_COPY[portal];
  const { count, ready } = usePublicJobCount();
  const image = PANEL_IMAGE[portal];

  return (
    // `isolate` so the field's -z-10 stays inside this panel: without a
    // stacking context a negative z-index child stacks in the page root and
    // slips behind the panel's own background.
    <aside className="auth-visual relative isolate hidden min-h-screen overflow-hidden bg-media-shade text-media-copy lg:flex lg:items-end lg:p-10 xl:p-14">
      {image ? (
        <>
          <img
            src={image}
            alt=""
            width="2400"
            height="1600"
            className="auth-visual__image absolute inset-0 size-full object-cover"
          />
          {/* Photographic treatments, photo-only: the veil dims a picture so
              copy clears it, and the wash warms one so the portal reads. On
              the field panel both jobs are already done in the shader — the
              textBand masks the copy band and the field IS the signal — so
              layering them there would only muddy it. */}
          <div aria-hidden="true" className="auth-visual__veil absolute inset-0" />
          <div aria-hidden="true" className="auth-visual__wash absolute inset-0" />
        </>
      ) : (
        // The copy sits in the bottom third (items-end), so the band masks the
        // field out of exactly that third — the field pools in the upper two
        // thirds where the panel has nothing to say yet.
        <Atmosphere ground="media" className="-z-10" textBand={[0.52, 0.86]} />
      )}

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
