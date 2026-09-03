import { ArrowDown, ArrowUpRight, BadgeCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CATALOGUE_COMPANIES } from "@jobportal/shared";

import { jobBoardPath } from "@/hooks/useJobSearch";
import { useLandingJobs } from "@/hooks/useLandingJobs";
import { Atmosphere } from "@/lib/atmosphere/Atmosphere";
import { displayCount } from "@/lib/displayCount";
import { Reveal } from "@/lib/motion";
import { useInViewOnce } from "@/lib/motion/index";
import { AnimatedNumber } from "@/lib/numberFlow";
import "./landing-interactions.css";

/**
 * A hand-picked front row, not the roster.
 *
 * Deliberately nine of the twenty-seven catalogue employers rather than all of
 * them: the marquee duplicates its list to loop seamlessly, so the full roster
 * would scroll fifty-four rows and bury the recognisable names that make the
 * strip worth showing. The counter beside the heading states the ratio, so this
 * being a selection is on the page rather than implied.
 */
const EMPLOYERS = [
  { name: "Amazon", logo: "/images/companies/amazon.png", tone: "bg-signal-muted" },
  { name: "Flipkart", logo: "/images/companies/flipkart.png", tone: "bg-paper-sunken" },
  { name: "Meta", logo: "/images/companies/meta.png", tone: "bg-signal-muted" },
  { name: "IBM", logo: "/images/companies/ibm.svg", tone: "bg-paper-sunken" },
  { name: "Microsoft", logo: "/images/companies/microsoft.png", tone: "bg-signal-muted" },
  { name: "Tata Consultancy Services", logo: "/images/companies/tcs.png", tone: "bg-paper-sunken" },
  { name: "Cognizant", logo: "/images/companies/cognizant.png", tone: "bg-signal-muted" },
  { name: "Accenture", logo: "/images/companies/accenture.png", tone: "bg-paper-sunken" },
  { name: "Infosys", logo: "/images/companies/infosys.png", tone: "bg-signal-muted" },
] as const;

const CATEGORIES = [
  {
    title: "Frontend Developer",
    description: "Interfaces, design systems, and the details people feel.",
    field: "Product craft",
  },
  {
    title: "Backend Developer",
    description: "Reliable services, clear contracts, and systems built to last.",
    field: "Core systems",
  },
  {
    title: "Full Stack Developer",
    description: "Own the path from a customer need to working software.",
    field: "End-to-end",
  },
  {
    title: "Data Scientist",
    description: "Turn complex signals into decisions a team can act on.",
    field: "Intelligence",
  },
  {
    title: "Machine Learning Engineer",
    description: "Move models from an experiment into useful, resilient products.",
    field: "Applied AI",
  },
  {
    title: "DevOps Engineer",
    description: "Make delivery calm, observable, and repeatable at every scale.",
    field: "Infrastructure",
  },
  {
    title: "UI/UX Designer",
    description: "Shape coherent products through research, systems, and craft.",
    field: "Experience",
  },
  {
    title: "Mobile App Developer",
    description: "Build focused experiences for the devices people keep closest.",
    field: "Mobile",
  },
  {
    title: "Cloud Engineer",
    description: "Design secure foundations that flex with the business.",
    field: "Cloud systems",
  },
  {
    title: "Cybersecurity Specialist",
    description: "Protect products, people, and trust before incidents happen.",
    field: "Security",
  },
] as const;

/**
 * The live figure: the API's open-role count, rolled up from zero the first
 * time the tile enters the viewport.
 *
 * The wrapper span is unconditional so the in-view ref attaches on mount — a
 * ref that first exists when the data arrives is a ref the observer never
 * sees. Inside it, the dash contract stays displayCount's alone: unknown,
 * empty and failed all print "—" rather than a number, so a marketplace with
 * no answer never advertises "0 open roles". The zero beneath it only ever
 * paints off-screen (the gate is holding it back) or as the first frame of
 * the roll itself.
 *
 * A figure the user is already looking at when the data lands swaps
 * dash→number without a roll — the count-up belongs to the scroll-in, and
 * manufacturing one on arrival would mean showing the resting zero the dash
 * exists to avoid. Under reduced motion the gate collapses and the figure is
 * simply present, the same contract every reveal holds.
 */
function OpenRolesFigure({ total }: { total: number | undefined }) {
  const { ref, inView } = useInViewOnce<HTMLSpanElement>();
  const count = typeof total === "number" && total > 0 ? total : null;
  return (
    <span ref={ref}>
      {count === null ? displayCount(total) : <AnimatedNumber value={inView ? count : 0} />}
    </span>
  );
}

const CategoryCarousel = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const activeCategory = CATEGORIES[activeIndex];
  // Shares LatestJobs' query rather than issuing its own: the landing page
  // already fetches this page of jobs, and the envelope's `total` was being
  // discarded while the tile below printed a hardcoded number in its place.
  const { data } = useLandingJobs();

  /**
   * Every figure is derived from what it claims to count.
   *
   * These were the literals "90", "9" and "10", accurate when the seed held
   * nine employers and silently wrong from the moment the catalogue grew to
   * twenty-seven. Disciplines counts CATEGORIES, not the thirteen-entry
   * department taxonomy: the tile sits beneath "Explore by discipline" next to
   * exactly these rows, and the taxonomy's thirteenth entry is "Other".
   *
   * Only the open-roles figure animates. It is the one number on the page
   * that arrives — the API's answer, landing while the other two are
   * constants — and the roll is how a figure's arrival reads as live rather
   * than painted. The constants render once and never change, which is the
   * case AnimatedNumber's own contract says not to spend a web component on.
   */
  const STATS: Array<{ label: string; figure: ReactNode }> = [
    { label: "open roles", figure: <OpenRolesFigure total={data?.total} /> },
    { label: "verified teams", figure: String(CATALOGUE_COMPANIES.length) },
    { label: "disciplines", figure: String(CATEGORIES.length) },
  ];

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const closestVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];

        const index = Number((closestVisible?.target as HTMLElement | undefined)?.dataset.categoryIndex);
        if (Number.isInteger(index)) setActiveIndex(index);
      },
      { rootMargin: "-28% 0px -48% 0px", threshold: [0, 0.35, 0.7] },
    );

    const rows = rowRefs.current;
    rows.forEach((row) => {
      if (row) observer.observe(row);
    });

    return () => observer.disconnect();
  }, []);

  const progress = `${((activeIndex + 1) / CATEGORIES.length) * 100}%`;

  return (
    <section
      aria-labelledby="categories-heading"
      // `isolate` keeps the field's -z-10 inside the section (the same reason
      // the hero and the auth panel isolate theirs) instead of letting it slip
      // behind the section's own paper.
      className="relative isolate overflow-clip border-y border-line bg-paper"
    >
      {/* The ambient field this section was missing. The hero above is the
          richest surface on the page and this was three screens of flat paper:
          the field pools a teal wash into the upper third, around and above
          the heading column, and the shader's textBand + 0.12 paper ceiling
          keep it measured-safe behind whatever prose it passes. Cards and
          rows above it are opaque, so the field reads in the gaps and
          margins rather than behind content. */}
      <Atmosphere className="-z-10" textBand={[0.34, 0.62]} />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-28">
        <Reveal>
          <div className="lg:sticky lg:top-32 lg:min-h-[30rem] lg:self-start">
            <p className="text-xs font-semibold uppercase text-signal-text">Explore by discipline</p>
            <h2
              id="categories-heading"
              className="mt-4 max-w-lg font-display text-5xl font-semibold leading-[0.98] text-ink sm:text-6xl"
            >
              Find the work that pulls you forward.
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-ink-muted">
              Ten focused paths into the teams building what comes next. Follow one, or keep
              exploring until the right role clicks.
            </p>

            <div className="mt-10 hidden grid-cols-[auto_1fr] gap-5 border-t border-line pt-6 lg:grid">
              <div className="role-index-progress" aria-hidden="true">
                <span className="role-index-progress__fill" style={{ height: progress }} />
              </div>
              <div aria-hidden="true" className="min-h-28">
                <div className="flex items-baseline gap-2 font-mono text-xs text-ink-muted">
                  <span className="text-ink">{String(activeIndex + 1).padStart(2, "0")}</span>
                  <span>/</span>
                  <span>{String(CATEGORIES.length).padStart(2, "0")}</span>
                </div>
                <p className="mt-4 font-display text-2xl font-semibold leading-tight text-ink">
                  {activeCategory.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{activeCategory.field}</p>
              </div>
            </div>

            <Link
              to="/jobs"
              viewTransition
              className="group mt-9 inline-flex items-center gap-3 border-b border-ink pb-2 text-sm font-semibold text-ink transition-colors hover:border-signal-text hover:text-signal-text focus-visible:rounded-sharp focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
            >
              Browse every open role
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>

            <div className="mt-10">
              <div className="mb-3 flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                <span>Featured teams</span>
                <span className="font-mono text-[0.62rem] normal-case tracking-normal">
                  {EMPLOYERS.length} of {CATALOGUE_COMPANIES.length}
                </span>
              </div>
              <div className="employer-stream" aria-label="Featured employers">
                <div className="employer-stream__track">
                  {[...EMPLOYERS, ...EMPLOYERS].map((employer, index) => (
                    <Link
                      key={`${employer.name}-${index}`}
                      to={jobBoardPath(employer.name)}
                      viewTransition
                      className="employer-stream__row group px-1 focus-visible:rounded-sharp focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
                    >
                      <span className={`employer-stream__mark ${employer.tone}`} aria-hidden="true"><img src={employer.logo} alt="" /></span>
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-ink transition-colors group-hover:text-signal-text"><span className="truncate">{employer.name}</span><BadgeCheck aria-label="Verified employer" className="size-3.5 shrink-0 text-signal-text" /></span>
                      <ArrowUpRight aria-hidden="true" className="size-3.5 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 border-y border-line py-4">
                {STATS.map((item) => (
                  <div key={item.label} className="px-3 first:pl-0 last:pr-0 [&+&]:border-l [&+&]:border-line">
                    <strong className="block font-display text-2xl font-semibold text-ink">{item.figure}</strong>
                    <span className="mt-1 block text-[0.68rem] font-semibold uppercase leading-4 text-ink-muted">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-ink-muted">Technical, creative, commercial, finance, people, and operations careers in one marketplace.</p>
            </div>
          </div>
        </Reveal>

        <ol className="border-t border-line">
          {CATEGORIES.map((category, index) => (
            <li
              key={category.title}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              data-category-index={index}
              onPointerEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            >
              <Reveal delay={(index % 3) * 0.04}>
                <Link
                  to={jobBoardPath(category.title)}
                  viewTransition
                  className="role-index-row group grid min-h-36 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-7 pr-1 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-signal-ring focus-visible:outline-none sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-5 sm:py-8"
                >
                  <span className="pt-1 font-mono text-xs text-ink-muted transition-colors group-hover:text-signal-text">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase text-ink-muted transition-colors group-hover:text-signal-text">
                      {category.field}
                    </span>
                    <span className="mt-2 block font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">
                      {category.title}
                    </span>
                    <span className="mt-3 block max-w-lg text-sm leading-6 text-ink-muted">
                      {category.description}
                    </span>
                  </span>
                  <span className="role-index-row__action mt-1 flex size-10 items-center justify-center rounded-full border border-line text-ink-muted transition-colors group-hover:border-signal group-hover:bg-signal group-hover:text-signal-fg">
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                    <span className="sr-only">Browse {category.title} roles</span>
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs text-ink-muted xl:flex" aria-hidden="true">
        <ArrowDown className="size-3.5" />
        Continue to new openings
      </div>
    </section>
  );
};

export default CategoryCarousel;
