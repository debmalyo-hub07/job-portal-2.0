import { Search, SearchX, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router";

import FilterCard from "./FilterCard";
import Job from "./Job";
import { EmptyState } from "./layout/EmptyState";
import { Pager } from "./layout/ListControls";
import PageShell from "./layout/PageShell";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";
import { useJobSearch } from "@/hooks/useJobSearch";
import { StaggerItem, StaggerList } from "@/lib/motion";

const Jobs = () => {
  const { data, isPending, isError, error } = useJobSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobs = data?.items ?? [];
  const keyword = searchParams.get("keyword") ?? "";
  const activeFilterCount = ["location", "jobType"].reduce(
    (count, key) => count + (searchParams.get(key)?.split(",").filter(Boolean).length ?? 0),
    ["salaryMax", "experienceMax", "remote"].reduce(
      (count, key) => count + (searchParams.has(key) ? 1 : 0),
      0,
    ),
  );

  const setKeyword = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    if (next.trim()) sp.set("keyword", next);
    else sp.delete("keyword");
    sp.delete("page");
    setSearchParams(sp, { replace: true });
  };

  const goToPage = (next: number) => {
    const sp = new URLSearchParams(searchParams);
    if (next <= 1) sp.delete("page");
    else sp.set("page", String(next));
    setSearchParams(sp);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PageShell density="compact" width="wide" motion="standard" className="pt-8">
      <header className="border-b border-line pb-7">
        <p className="text-xs font-semibold uppercase text-signal-text">Job marketplace</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-4xl font-display text-4xl font-semibold leading-none text-balance text-ink sm:text-5xl lg:text-6xl">
              {keyword ? `Jobs matching "${keyword}"` : "Open roles"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              Compare focused opportunities across location, experience, compensation, and ways of working.
            </p>
          </div>
          <label className="relative block w-full max-w-md">
            <span className="sr-only">Search open roles</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              name="keyword"
              autoComplete="off"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search roles, teams, or skills"
              className="pl-10"
            />
          </label>
        </div>
      </header>

      <div className="mt-7 grid gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="hidden md:block">
          <FilterCard idPrefix="desktop-filter" />
        </div>

        <main className="min-w-0">
          <div className="mb-4 flex min-h-11 items-center justify-between gap-4 border-b border-line pb-3">
            <p className="text-sm font-medium text-ink">
              {isPending ? "Finding roles..." : `${data?.total ?? jobs.length} roles`}
            </p>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" className="md:hidden">
                  <SlidersHorizontal data-icon="inline-start" />
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0">
                <SheetHeader className="border-b border-line px-5 py-5 pr-12">
                  <SheetTitle>Filter roles</SheetTitle>
                  <SheetDescription>Narrow the list by location, role type, pay, and experience.</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                  <FilterCard idPrefix="mobile-filter" embedded />
                </div>
                <SheetFooter className="border-t border-line p-4">
                  <SheetClose asChild>
                    <Button type="button" variant="signal" className="w-full">
                      View {data?.total ?? jobs.length} roles
                    </Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>

          {isPending ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-80 rounded-surface" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-surface border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">
              Could not load jobs: {error instanceof Error ? error.message : "unknown error"}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No jobs match these filters"
              description={keyword ? `Nothing matched "${keyword}". Try a broader search or clear a filter.` : "Try clearing a filter to widen the search."}
            />
          ) : (
            <>
              <StaggerList className="divide-y divide-line border-y border-line">
                {jobs.map((job) => (
                  <StaggerItem key={job.id} className="h-full">
                    <Job job={job} />
                  </StaggerItem>
                ))}
              </StaggerList>
              {(data?.pages ?? 1) > 1 ? (
                <div className="mt-6 flex justify-end">
                  <Pager page={data?.page ?? 1} pages={data?.pages ?? 1} total={data?.total ?? jobs.length} onPage={goToPage} />
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
    </PageShell>
  );
};

export default Jobs;
