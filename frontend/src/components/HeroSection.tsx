import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "./ui/button";
import ImageHero from "./landing/ImageHero";
import { jobBoardPath } from "@/hooks/useJobSearch";
import { FadeIn } from "@/lib/motion";
import { JobSearchCombobox } from "./search/JobSearchCombobox";

function HeroSection() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const searchJobHandler = (event: FormEvent) => {
    event.preventDefault();
    navigate(jobBoardPath(query));
  };
  const runSearch = (value: string) => navigate(jobBoardPath(value));

  return (
    <ImageHero
      portal="seeker"
      src="/images/cairn-seeker-hero.jpg"
      alt="A product team working together around a shared table"
      objectPosition="center 56%"
      mobileObjectPosition="65% 56%"
      className="min-h-[46rem] bg-media-shade text-media-copy md:min-h-[min(56rem,100svh)]"
    >
      <FadeIn className="relative z-20 mx-auto flex min-h-[inherit] max-w-7xl items-center px-4 pt-28 pb-12 sm:px-6 sm:pt-32 sm:pb-16 lg:-translate-y-12">
        <div data-hero-copy="seeker" className="max-w-[45rem]">
          <p className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-media-copy/75 before:h-px before:w-8 before:bg-signal">
            Cairn for candidates
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[0.94] text-balance text-media-copy sm:text-7xl lg:text-[5.5rem]">
            Work that fits your next move.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-media-copy/80 sm:text-lg">
            Search focused roles, understand your fit, and keep every application moving in one place.
          </p>

          <form
            onSubmit={searchJobHandler}
            className="hero-search-shell mt-8 flex w-full max-w-[43rem] flex-col gap-2 rounded-surface border border-media-copy/25 bg-media-surface/95 p-1.5 text-media-surface-ink shadow-[var(--elevate-3)] backdrop-blur-xl sm:flex-row"
          >
            <JobSearchCombobox id="hero-search" label="Search for jobs, companies, or skills" value={query} onChange={setQuery} onSubmit={runSearch} tone="hero" />
            <Button type="submit" variant="signal" size="lg" className="sm:px-7">
              Search roles
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
        </div>
      </FadeIn>
    </ImageHero>
  );
}

export default HeroSection;
