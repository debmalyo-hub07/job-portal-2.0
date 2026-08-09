import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { Button } from "./ui/button";
import { jobBoardPath } from "@/hooks/useJobSearch";
import { FadeIn } from "@/lib/motion";

/**
 * The hero sits on the page's left axis rather than centred.
 *
 * The inherited version centred this block and then left-aligned the section
 * header directly beneath it, so the page had two competing axes within one
 * scroll. Everything now reads down one spine.
 */
function HeroSection() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Navigates to the board with the keyword in the URL, rather than writing a
  // redux field the board no longer reads. The submitted search is now a link.
  const searchJobHandler = (e: FormEvent) => {
    e.preventDefault();
    navigate(jobBoardPath(query));
  };

  return (
    <FadeIn>
      <div className="flex flex-col items-start gap-5 py-(--space-section)">
        <span className="rounded-full bg-signal-muted px-4 py-1.5 text-sm font-medium text-signal-text">
          Hiring is open
        </span>
        <h1 className="max-w-3xl font-display text-display-lg font-bold text-balance text-ink">
          Search, apply, and get your next role.
        </h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Find jobs, internships, and contract work matched to your skills.
        </p>
        <form
          onSubmit={searchJobHandler}
          className="flex w-full max-w-xl items-center gap-2 rounded-full border border-line bg-paper-raised py-1 pr-1 pl-5"
        >
          <label htmlFor="hero-search" className="sr-only">
            Search for jobs, companies, or skills
          </label>
          <input
            id="hero-search"
            type="text"
            placeholder="Search for jobs, companies, or skills"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-none bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
          <Button type="submit" variant="signal" size="icon" className="rounded-full">
            <Search />
            <span className="sr-only">Search</span>
          </Button>
        </form>
      </div>
    </FadeIn>
  );
}

export default HeroSection;
