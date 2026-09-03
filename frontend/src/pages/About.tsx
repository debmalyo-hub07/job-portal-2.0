import { ArrowRight, BadgeCheck, Compass, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { MOTION_VARS } from "@/components/layout/motionTiers";
import { FadeIn, Reveal } from "@/lib/motion";

const PRINCIPLES = [
  {
    icon: Compass,
    title: "Make the path legible",
    body: "Jobs stay readable without an account, filters live in the URL, and every application state has a plain-language explanation.",
  },
  {
    icon: BadgeCheck,
    title: "Earn the right to hire",
    body: "Employer accounts begin pending. An administrator reviews them before they can publish roles or open candidate files.",
  },
  {
    icon: LockKeyhole,
    title: "Keep private material private",
    body: "Resumes are private assets served through short-lived signed links only to the employer that owns the role applied to.",
  },
] as const;

const PORTALS = [
  {
    eyebrow: "Candidates",
    title: "Search with context",
    body: "Compare roles, keep a reusable profile, understand fit, and see every application in one place.",
    href: "/jobs",
    label: "Browse jobs",
  },
  {
    eyebrow: "Employers",
    title: "Hire close to the work",
    body: "Build a company profile, publish a focused role, and review the people who deliberately applied to it.",
    href: "/hire",
    label: "Explore hiring",
  },
  {
    eyebrow: "Administrators",
    title: "Moderate with a clear boundary",
    body: "Approve recruiters and oversee jobs and companies without turning the console into a bulk export of candidate data.",
    href: "/admin/login",
    label: "Admin sign in",
  },
] as const;

export default function About() {
  return (
    <main
      data-density="spacious"
      data-motion="ambient"
      style={MOTION_VARS.ambient}
      className="bg-paper text-ink"
    >
      <section className="relative isolate min-h-[34rem] max-h-[44rem] overflow-hidden bg-media-shade text-media-copy">
        <img
          src="/images/cairn-seeker-hero.jpg"
          alt="A team working together around a shared table"
          width="2400"
          height="1600"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-center grayscale-[0.08] saturate-[0.82]"
        />
        <div aria-hidden="true" className="hero-media-veil absolute inset-0" />
        <FadeIn className="relative mx-auto flex min-h-[34rem] max-w-7xl items-end px-4 py-14 sm:px-6 lg:py-20">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase text-media-copy/70">About Cairn</p>
            <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[0.94] text-balance text-media-copy sm:text-7xl lg:text-[5.5rem]">
              Mark the way for whoever is next.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-media-copy/80 sm:text-lg">
              A cairn is a route marker left by one traveller for another. This platform applies the same idea to finding work: make the route visible, preserve the useful signals, and remove avoidable uncertainty.
            </p>
          </div>
        </FadeIn>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="about-purpose">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.35fr] lg:gap-20">
          <Reveal>
            <p className="text-xs font-semibold uppercase text-signal-text">Why it exists</p>
            <h2 id="about-purpose" className="mt-3 font-display text-display-md font-semibold text-balance text-ink">
              Job platforms should reduce ambiguity, not manufacture more of it.
            </h2>
          </Reveal>
          <Reveal delay={0.06} className="space-y-5 text-base leading-8 text-ink-muted">
            <p>
              Candidates should be able to inspect a role before surrendering personal data. Employers should have enough context to make a considered shortlist. Administrators should have narrow, auditable tools instead of invisible authority.
            </p>
            <p>
              Cairn separates those responsibilities into 3 portals and keeps each boundary explicit. A candidate account cannot become a recruiter by changing a control. A recruiter cannot publish until approved. An admin is created only through an existing admin and a private provisioning key.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 border-t border-line">
          {PRINCIPLES.map((principle, index) => (
            <Reveal key={principle.title} delay={index * 0.05}>
              <article className="grid gap-5 border-b border-line py-8 md:grid-cols-[4rem_1fr_1.2fr] md:items-start">
                <span className="font-mono text-sm text-ink-muted">0{index + 1}</span>
                <div className="flex items-center gap-3">
                  <principle.icon aria-hidden="true" className="size-5 text-signal-text" />
                  <h3 className="font-display text-2xl font-semibold text-ink">{principle.title}</h3>
                </div>
                <p className="max-w-xl text-sm leading-7 text-ink-muted">{principle.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-paper-sunken" aria-labelledby="about-portals">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <Reveal className="grid gap-6 border-b border-line pb-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase text-signal-text">One platform, clear roles</p>
              <h2 id="about-portals" className="mt-3 font-display text-display-md font-semibold text-balance text-ink">
                Each portal asks only for the information its work requires.
              </h2>
            </div>
            <p className="max-w-2xl self-end text-sm leading-7 text-ink-muted">
              Registration stays short. Candidate matching details are completed in the candidate profile, company information is completed in the employer workspace, and administrator accounts carry no participant profile at all.
            </p>
          </Reveal>

          <div className="grid lg:grid-cols-3">
            {PORTALS.map((portal, index) => (
              <Reveal
                key={portal.eyebrow}
                delay={index * 0.06}
                className="border-b border-line py-9 lg:border-r lg:border-b-0 lg:px-8 first:lg:pl-0 last:border-r-0 last:lg:pr-0"
              >
                <p className="text-xs font-semibold uppercase text-signal-text">{portal.eyebrow}</p>
                <h3 className="mt-3 font-display text-2xl font-semibold text-ink">{portal.title}</h3>
                <p className="mt-4 min-h-24 text-sm leading-7 text-ink-muted">{portal.body}</p>
                <Link
                  to={portal.href}
                  viewTransition
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-signal-text"
                >
                  {portal.label}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <Reveal className="grid gap-8 lg:grid-cols-[1.2fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-signal-text">
              <ShieldCheck aria-hidden="true" className="size-5" />
              <span className="text-xs font-semibold uppercase">Built in public</span>
            </div>
            <h2 className="mt-4 max-w-3xl font-display text-display-md font-semibold text-balance text-ink">
              The product is early, so the honest state matters more than polished claims.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-ink-muted">
              The board, applications, recruiter approval, employer workspace, and moderation console work today. Where a workflow is not available yet, the help and legal pages say so directly.
            </p>
            {/* Nominatim's usage policy asks its data to be credited where it is
                used; the location feature answers through it. */}
            <p className="mt-3 text-xs text-ink-muted">
              Place detection on this platform answers through OpenStreetMap — place data ©
              OpenStreetMap contributors.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/help" viewTransition>
                Read the FAQ
                <Users data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="signal">
              <Link to="/contact" viewTransition>
                Contact Cairn
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
