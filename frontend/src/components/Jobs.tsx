import { useEffect, useRef, useState, type FormEvent } from "react";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router";

import FilterCard from "./FilterCard";
import Job from "./Job";
import { EmptyState } from "./layout/EmptyState";
import { Pager } from "./layout/ListControls";
import PageShell from "./layout/PageShell";
import { Button } from "./ui/button";
import { JobSearchCombobox } from "./search/JobSearchCombobox";
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
  const [searchDraft, setSearchDraft] = useState(keyword);
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => setSearchDraft(keyword), [keyword]);
  const activeFilterCount = ["location", "jobType", "department", "company"].reduce(
    (count, key) => count + (searchParams.get(key)?.split(",").filter(Boolean).length ?? 0),
    ["salaryMax", "experienceMax", "remote"].reduce(
      (count, key) => count + (searchParams.has(key) ? 1 : 0),
      0,
    ),
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const sp = new URLSearchParams(searchParams);
    if (searchDraft.trim()) sp.set("keyword", searchDraft.trim());
    else sp.delete("keyword");
    sp.delete("page");
    setSearchParams(sp);
  };
  const runSearch = (value: string) => {
    const sp = new URLSearchParams(searchParams);
    if (value.trim()) sp.set("keyword", value.trim()); else sp.delete("keyword");
    sp.delete("page");
    setSearchParams(sp);
  };

  const goToPage = (next: number) => {
    const sp = new URLSearchParams(searchParams);
    if (next <= 1) sp.delete("page");
    else sp.set("page", String(next));
    setSearchParams(sp);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PageShell density="compact" width="wide" motion="standard" className="pt-8">
      <header className="border-b border-line pb-7">
        <p className="text-xs font-semibold uppercase text-signal-text">Job marketplace</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="max-w-4xl font-display text-4xl font-semibold leading-none text-balance text-ink sm:text-5xl lg:text-6xl">
              {keyword ? `Jobs matching "${keyword}"` : "Open roles"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              Compare focused opportunities across location, experience, compensation, and ways of working.
            </p>
          </div>
          <form onSubmit={submitSearch} className="job-board-search flex w-full max-w-xl items-stretch overflow-hidden rounded-surface border border-line bg-paper shadow-[var(--elevate-1)]">
            <JobSearchCombobox id="job-board-search" label="Search open roles" value={searchDraft} onChange={setSearchDraft} onSubmit={runSearch} />
            <Button type="submit" variant="signal" className="m-1 h-auto rounded-sharp border-0 px-5">Search</Button>
          </form>
        </div>
      </header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <FilterCard idPrefix="desktop-filter" />
        </div>

        <main ref={resultsRef} className="min-w-0 scroll-mt-24">
          <div className="mb-4 flex min-h-11 items-center justify-between gap-4 border-b border-line pb-3">
            <p className="text-sm font-medium text-ink">
              {isPending ? "Finding roles..." : `${data?.total ?? jobs.length} roles`}
            </p>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" className="lg:hidden">
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
            <div className="divide-y divide-line overflow-hidden rounded-surface border border-line bg-paper-raised shadow-[var(--elevate-1)]">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="grid min-h-52 gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:p-6">
                  <div className="space-y-4"><Skeleton className="h-8 w-3/5" /><Skeleton className="h-4 w-2/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
                  <Skeleton className="hidden h-full sm:block" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-surface border border-danger/40 bg-danger-muted p-4 text-sm text-danger-text" role="alert">
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
              <StaggerList className="divide-y divide-line overflow-hidden rounded-surface border border-line bg-paper-raised shadow-[var(--elevate-1)]">
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
