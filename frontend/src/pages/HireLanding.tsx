import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, ClipboardList, Send, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Atmosphere } from "@/lib/atmosphere/Atmosphere";
import { FadeIn, Reveal } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Create a company",
    body: "One profile your whole team posts under.",
  },
  {
    icon: Send,
    title: "Post a role",
    body: "Title, requirements, salary band, location.",
  },
  {
    icon: Users,
    title: "See every applicant",
    body: "Profile and resume, already parsed.",
  },
];

/**
 * The employer front door.
 *
 * Before this page existed, an anonymous visitor who wanted to hire had nowhere
 * to land: the workspace bounced them to the seeker home, so someone arriving
 * to post a job was shown "Get Your Dream Job".
 *
 * Marketing surface, so it runs spacious density even though the portal is
 * recruiter — density follows the surface's job, not the portal.
 */
export default function HireLanding() {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.portal === "recruiter") navigate("/hire/companies", { replace: true });
  }, [user?.portal, navigate]);

  return (
    // `motion="ambient"`: this is the recruiter portal's marketing surface, and
    // it had no `motion` prop at all — so `data-motion` was absent, the tier
    // resolver defaulted to `response`, and every composable on the employer
    // front door correctly refused to run. Same class of defect as the dead
    // motion switches: nothing looked broken, the effects simply never existed.
    <PageShell width="wide" motion="ambient">
      {/* Atmosphere host, matching HeroSection: `relative isolate` for the
          absolutely-positioned layer, negative inline margin so the field reaches
          the viewport edge from inside the container. The signal here is the
          recruiter hue, which the shader picks up from the token — the page does
          not name a colour. */}
      <div className="relative isolate -mx-6 px-6">
        <Atmosphere className="-z-10" textBand={[0.22, 0.85]} />
        <FadeIn>
          <p className="mb-4 inline-flex rounded-full bg-signal-muted px-3 py-1 text-sm font-medium text-signal-text">
            For employers
          </p>
          <h1 className="max-w-3xl font-display text-display-lg font-bold text-balance text-ink">
            Hire without the noise.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-muted">
            Post a role, see every applicant in one place, and decide faster.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild variant="signal" size="lg">
              <Link to="/hire/signup">
                Start hiring <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/hire/login">Sign in</Link>
            </Button>
          </div>
        </FadeIn>
      </div>

      {/*
        A sequence, not a grid of three equal things. The steps happen in an
        order, and the visitor's question is "what does this involve" — so they
        are numbered and they arrive in order as the reader reaches them. The
        `StaggerList` this replaces animated on mount, below the fold, so the
        ordering it expressed had already played out before anyone saw it.

        `<ol>` because the order is the content: a screen reader announces "list,
        3 items" and the position of each, which a div grid does not carry.
      */}
      <ol className="mt-(--space-section) grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="h-full">
            <Reveal delay={i * 0.08} className="h-full">
              <div className="flex h-full flex-col rounded-surface border border-line bg-paper-raised p-(--space-card)">
                <div className="flex items-center gap-2">
                  <step.icon aria-hidden="true" className="size-5 text-signal-text" />
                  {/* Mono on the step number: it is an aligned numeric sequence
                      down a row of cards, which is the sanctioned use. */}
                  <span aria-hidden="true" className="font-mono text-sm text-ink-muted">
                    {i + 1} / {STEPS.length}
                  </span>
                </div>
                <h2 className="mt-3 font-display text-xl font-semibold text-ink">{step.title}</h2>
                <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal className="mt-(--space-section) border-t border-line pt-6">
        <p className="text-sm text-ink-muted">
          Looking for a job instead?{" "}
          <Link to="/" className="text-signal-text hover:underline">
            Browse open roles
          </Link>
        </p>
      </Reveal>
    </PageShell>
  );
}
