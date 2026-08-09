import { Link } from "react-router";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel";
import { Button } from "./ui/button";
import { jobBoardPath } from "@/hooks/useJobSearch";

const CATEGORIES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Scientist",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "UI/UX Designer",
  "Mobile App Developer",
  "Cloud Engineer",
  "Cybersecurity Specialist",
  "Database Administrator",
  "Software Tester",
  "Game Developer",
  "Network Engineer",
];

/**
 * Role shortcuts into the job board.
 *
 * Two things changed in 2B-2. The rail sat on `max-w-xl mx-auto my-20` — a
 * centred axis inside a page that reads down one left spine, the same two-axis
 * problem 2B-1 fixed in the hero, plus hand-tuned spacing where every other
 * section resolves `--space-section` from `data-density`.
 *
 * And each chip was a `<button>` that dispatched a redux field and pushed
 * `/browse`. Now that a search is a URL, these are `Link`s: middle-click and
 * open-in-new-tab work, and the destination is visible on hover.
 */
const CategoryCarousel = () => {
  return (
    <section aria-labelledby="categories-heading" className="pb-(--space-section)">
      <h2 id="categories-heading" className="font-display text-display-md font-bold text-ink">
        Browse by <span className="text-signal-text">role</span>
      </h2>
      {/*
        px-12 leaves room for the arrows, which the primitive positions outside
        the content box — without it they sit on top of the first and last chip.
      */}
      <Carousel opts={{ align: "start" }} className="mt-8 w-full px-12">
        <CarouselContent>
          {CATEGORIES.map((category) => (
            <CarouselItem key={category} className="basis-auto">
              <Button asChild variant="outline" className="rounded-full">
                <Link to={jobBoardPath(category)}>{category}</Link>
              </Button>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </section>
  );
};

export default CategoryCarousel;
