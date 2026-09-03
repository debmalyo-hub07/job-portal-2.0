import { Link } from "react-router";
import { ArrowRight, Building2, ListChecks, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import ImageHero from "@/components/landing/ImageHero";
import { MOTION_VARS } from "@/components/layout/motionTiers";
import { Atmosphere } from "@/lib/atmosphere/Atmosphere";
import { FadeIn, Reveal } from "@/lib/motion";

const STEPS = [
  {
    icon: Building2,
    title: "Set up your company",
    body: "A clear employer profile that gives every role the right context.",
  },
  {
    icon: ListChecks,
    title: "Publish the role",
    body: "Define the work, expectations, location, and compensation in one pass.",
  },
  {
    icon: Users,
    title: "Review ranked applicants",
    body: "See candidate fit, profile details, and resumes in a single decision view.",
  },
] as const;

export default function HireLanding() {
  return (
    <div
      data-density="spacious"
      data-motion="ambient"
      style={MOTION_VARS.ambient}
      className="overflow-x-hidden bg-paper"
    >
      <ImageHero
        portal="recruiter"
        src="/images/cairn-hire-hero.jpg"
        alt="A hiring team discussing work around a table"
        objectPosition="center 48%"
        mobileObjectPosition="61% 48%"
        className="min-h-[calc(100svh-9rem)] max-h-[50rem] bg-media-shade text-media-copy md:min-h-[calc(100svh-7rem)]"
      >
        <FadeIn className="relative z-20 mx-auto flex min-h-[inherit] max-w-7xl items-end px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <div data-hero-copy="recruiter" className="max-w-[44rem]">
            <p className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase text-media-copy/75">
              <Sparkles aria-hidden="true" className="size-4" />
              Cairn for employers
            </p>
            <h1 className="font-display text-5xl font-semibold leading-[0.92] text-balance text-media-copy sm:text-7xl lg:text-[5.75rem]">
              Build the team, without the hiring theatre.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-media-copy/80 sm:text-lg">
              Publish thoughtful roles, review applicants by fit, and keep every decision close to the work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/hire/signup" viewTransition>
                  Start hiring
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-media-copy/35 bg-media-copy/10 text-media-copy hover:border-media-copy/60 hover:bg-media-copy/15">
                <Link to="/hire/login" viewTransition>Sign in</Link>
              </Button>
            </div>
          </div>
        </FadeIn>
      </ImageHero>

      {/* Full-bleed so the field spans the viewport, not the content column —
          a wash that stopped at max-w-7xl would read as a misaligned patch.
          The gold field pools above and around the heading; the shader masks
          it out of the steps' prose band and the 0.12 paper ceiling holds it
          measured-safe where it does pass. `isolate` keeps the -z-10 layer
          inside the section. */}
      <section
        aria-labelledby="hiring-flow-heading"
        className="relative isolate overflow-clip bg-paper"
      >
        <Atmosphere className="-z-10" textBand={[0.3, 0.6]} />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.6fr] lg:gap-16">
            <Reveal>
              <p className="text-xs font-semibold uppercase text-signal-text">The workflow</p>
              <h2 id="hiring-flow-heading" className="mt-2 font-display text-display-md font-semibold text-balance text-ink">
                Less admin between you and a strong shortlist.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-ink-muted">
                Cairn keeps company context, role requirements, and applicant fit connected from the first post to the final decision.
              </p>
            </Reveal>

            <ol className="border-t border-line">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Reveal delay={index * 0.06} className="grid gap-4 border-b border-line py-7 sm:grid-cols-[3rem_1fr_auto] sm:items-start">
                    <span className="font-mono text-sm text-ink-muted">0{index + 1}</span>
                    <div>
                      <h3 className="text-xl font-semibold text-ink">{step.title}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">{step.body}</p>
                    </div>
                    <span className="hidden size-10 place-items-center rounded-sharp bg-signal-muted text-signal-text sm:grid">
                      <step.icon aria-hidden="true" className="size-5" />
                    </span>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>

          <Reveal className="mt-14 flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-muted">Looking for your next role instead?</p>
            <Button asChild variant="outline">
              <Link to="/jobs" viewTransition>
                Browse open roles
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
