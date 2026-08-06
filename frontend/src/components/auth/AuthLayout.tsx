import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Portal } from "@jobportal/shared";

import { FadeIn } from "@/lib/motion";
import { AUTH_COPY } from "./authCopy";
import { PortalPanel } from "./PortalPanel";

/**
 * Full-height split: form column, portal panel.
 *
 * Deliberately no marketing navbar — the inherited pages mounted <Navbar/> and
 * then floated a w-1/2 card in the remaining space, leaving two thirds of the
 * viewport empty. The wordmark lives in the form column instead.
 *
 * Below `md` the panel is hidden and the form takes the full width.
 */
export function AuthLayout({
  portal,
  title,
  subtitle,
  children,
}: {
  portal: Portal;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const copy = AUTH_COPY[portal];

  return (
    <div className="grid min-h-screen bg-paper md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 md:px-12">
        <FadeIn className="mx-auto w-full max-w-sm">
          <Link to={copy.homeHref} className="inline-block">
            <span className="font-display text-xl font-bold text-ink">
              Job<span className="text-signal-text">{copy.wordmarkSuffix}</span>
            </span>
          </Link>

          <h1 className="mt-10 font-display text-display-sm font-semibold text-ink">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-sm text-ink-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {/* Admin has no sibling portal to advertise, so the whole rule-and-
              link block goes rather than leaving a bordered empty paragraph. */}
          {copy.crossLinkHref && copy.crossLinkLabel && copy.crossLinkText ? (
            <p className="mt-10 border-t border-line pt-6 text-sm text-ink-muted">
              {copy.crossLinkLabel}{" "}
              <Link to={copy.crossLinkHref} className="text-signal-text hover:underline">
                {copy.crossLinkText}
              </Link>
            </p>
          ) : null}
        </FadeIn>
      </div>

      <PortalPanel portal={portal} />
    </div>
  );
}
