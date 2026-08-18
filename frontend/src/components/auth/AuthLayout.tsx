import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import type { Portal } from "@jobportal/shared";

import { FadeIn } from "@/lib/motion";
import { AUTH_COPY } from "./authCopy";
import { PortalPanel } from "./PortalPanel";
import { Wordmark } from "@/components/shared/Wordmark";

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
    <div className="auth-layout grid min-h-screen bg-paper md:grid-cols-[minmax(24rem,0.82fr)_minmax(32rem,1.18fr)]">
      <div className="auth-form-column flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between gap-4">
          <Wordmark portal={portal} to={copy.homeHref ?? undefined} className="text-xl" />
          {/* Only where the portal has a public home to return to — see authCopy. */}
          {copy.homeHref ? (
            <Link
              to={copy.homeHref}
              className="inline-flex items-center gap-2 rounded-sharp text-sm font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-[3px] focus-visible:ring-signal-ring"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Link>
          ) : null}
        </div>

        <div className="flex flex-1 items-center py-12">
          <FadeIn className="mx-auto w-full max-w-md">
            <div className="auth-form-surface">
              <div className="auth-form-surface__meta">
                <span className="auth-form-surface__marker" aria-hidden="true" />
                <span>{portal === "seeker" ? "Candidate account" : portal === "recruiter" ? "Employer account" : "Admin access"}</span>
                <span className="ml-auto font-mono text-[0.68rem] text-ink-muted">CAIRN / 01</span>
              </div>
              <h1 className="mt-5 font-display text-[2.5rem] font-semibold leading-tight text-balance text-ink">
                {title}
              </h1>
              {subtitle ? <p className="mt-3 text-sm leading-6 text-ink-muted">{subtitle}</p> : null}

              <div className="mt-8">{children}</div>

              {copy.crossLinkHref && copy.crossLinkLabel && copy.crossLinkText ? (
                <p className="mt-9 border-t border-line pt-6 text-sm text-ink-muted">
                  {copy.crossLinkLabel}{" "}
                  <Link to={copy.crossLinkHref} className="font-semibold text-ink hover:text-signal-text">
                    {copy.crossLinkText}
                  </Link>
                </p>
              ) : null}
            </div>
          </FadeIn>
        </div>
      </div>

      <PortalPanel portal={portal} />
    </div>
  );
}
