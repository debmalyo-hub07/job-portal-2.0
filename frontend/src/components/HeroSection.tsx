import { useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "./ui/button";
import ImageHero from "./landing/ImageHero";
import { jobBoardPath } from "@/hooks/useJobSearch";
import { FadeIn } from "@/lib/motion";

function HeroSection() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const searchJobHandler = (event: FormEvent) => {
    event.preventDefault();
    navigate(jobBoardPath(query));
  };

  return (
    <ImageHero
      portal="seeker"
      src="/images/cairn-seeker-hero.jpg"
      alt="A product team working together around a shared table"
      objectPosition="center 56%"
      mobileObjectPosition="65% 56%"
      className="min-h-[calc(100svh-9rem)] max-h-[50rem] bg-media-shade text-media-copy md:min-h-[calc(100svh-7rem)]"
    >
      <FadeIn className="relative z-20 mx-auto flex min-h-[inherit] max-w-7xl items-end px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div data-hero-copy="seeker" className="max-w-[44rem]">
          <p className="mb-5 text-sm font-semibold uppercase text-media-copy/75">
            Cairn for candidates
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[0.92] text-balance text-media-copy sm:text-7xl lg:text-[6rem]">
            Work that fits your next move.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-media-copy/80 sm:text-lg">
            Search focused roles, understand your fit, and keep every application moving in one place.
          </p>

          <form
            onSubmit={searchJobHandler}
            className="mt-8 flex w-full max-w-2xl flex-col gap-2 rounded-surface bg-media-surface p-2 text-media-surface-ink shadow-2xl sm:flex-row"
          >
            <label htmlFor="hero-search" className="sr-only">
              Search for jobs, companies, or skills
            </label>
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
              <Search aria-hidden="true" className="size-5 shrink-0 text-media-surface-ink/55" />
              <input
                id="hero-search"
                type="search"
                name="keyword"
                autoComplete="off"
                placeholder="Role, company, or skill"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 w-full min-w-0 border-none bg-transparent text-base text-media-surface-ink outline-none placeholder:text-media-surface-ink/55"
              />
            </div>
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
