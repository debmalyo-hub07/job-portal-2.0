import { SearchX } from "lucide-react";
import { useSearchParams } from "react-router";

import Navbar from "./shared/Navbar";
import FilterCard from "./FilterCard";
import Job from "./Job";
import { EmptyState } from "./layout/EmptyState";
import { Pager } from "./layout/ListControls";
import { PageHeader } from "./layout/PageHeader";
import PageShell from "./layout/PageShell";
import { Skeleton } from "./ui/skeleton";
import { useJobSearch } from "@/hooks/useJobSearch";
import { StaggerItem, StaggerList } from "@/lib/motion";

/**
 * The seeker job board — the only one since 2B-2, when `/browse` became a
 * redirect here.
 *
 * Server state lives in react-query and filter state lives in the URL;
 * `useJobSearch` joins them. Nothing on this page holds a filter in component
 * state, which is what makes a filtered board a shareable link and the back
 * button work.
 */
const Jobs = () => {
  const { data, isPending, isError, error } = useJobSearch();
  const [searchParams, setSearchParams] = useSearchParams();

  const jobs = data?.items ?? [];
  const keyword = searchParams.get("keyword") ?? "";

  /**
   * Page is a URL param like every other filter, so paging is a normal
   * navigation — back returns to the previous page of results.
   */
  const goToPage = (next: number) => {
    const sp = new URLSearchParams(searchParams);
    if (next <= 1) {
      sp.delete("page");
    } else {
      sp.set("page", String(next));
    }
    setSearchParams(sp);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* Outside PageShell: the navbar is full-bleed, and the shell's inner
          container would clamp it to the content column. Same composition
          AdminShell uses. */}
      <Navbar />
      <PageShell density="compact" width="wide" motion="standard">
        {/*
          The page had no heading at all before 2B-2 — it opened on a filter
          rail and a grid, so a screen reader landed with nothing naming the
          surface.
        */}
        <PageHeader
          title={keyword ? `Jobs matching "${keyword}"` : "Open roles"}
          description="Filter by location, type, salary and experience. Every filter is in the URL, so a search is a link you can share."
        />

        <div className="flex flex-col gap-(--space-card) md:flex-row">
          <div className="w-full md:w-64 md:shrink-0">
            <FilterCard />
          </div>

          {/*
            No nested scroll container. This was `md:h-[88vh] md:overflow-y-auto`,
            which put a second scrollbar inside the page: the wheel stopped
            working once the pointer left the column, and on a short laptop the
            grid scrolled within a viewport that never moved.
          */}
          <div className="min-w-0 flex-1">
            {isPending ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-64 rounded-surface" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-danger text-sm p-4" role="alert">
                Could not load jobs: {error instanceof Error ? error.message : "unknown error"}
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No jobs match these filters"
                description={
                  keyword
                    ? `Nothing matched "${keyword}". Try a broader search, or clear a filter or two.`
                    : "Try clearing a filter to widen the search."
                }
              />
            ) : (
              <>
                <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {jobs.map((job) => (
                    <StaggerItem key={job.id} className="h-full">
                      <Job job={job} />
                    </StaggerItem>
                  ))}
                </StaggerList>
                {/*
                  The pagination primitive shipped in 2A and the seeker board
                  was the last list still without it — it asked for `limit=50`
                  and showed whatever came back, so results 51+ were
                  unreachable.
                */}
                <div className="mt-(--space-card)">
                  <Pager
                    page={data?.page ?? 1}
                    pages={data?.pages ?? 1}
                    total={data?.total ?? jobs.length}
                    onPage={goToPage}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </PageShell>
    </>
  );
};

export default Jobs;
