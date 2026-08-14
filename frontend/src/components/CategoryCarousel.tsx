import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { jobBoardPath } from "@/hooks/useJobSearch";
import { Reveal } from "@/lib/motion";
import "./landing-interactions.css";

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

const CategoryCarousel = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const activeCategory = CATEGORIES[activeIndex];

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
      className="relative overflow-clip border-y border-line bg-paper"
    >
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
              className="group mt-9 inline-flex items-center gap-3 border-b border-ink pb-2 text-sm font-semibold text-ink transition-colors hover:border-signal-text hover:text-signal-text focus-visible:rounded-sharp focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
            >
              Browse every open role
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
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
