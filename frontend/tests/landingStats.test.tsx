import { describe, expect, it, vi, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { CATALOGUE_COMPANIES } from "@jobportal/shared";

import { renderRoute } from "./helpers/renderRoute";
import CategoryCarousel from "@/components/CategoryCarousel";
import LatestJobs from "@/components/LatestJobs";
import { displayCount } from "@/lib/displayCount";
import { apiClient } from "@/lib/apiClient";

/**
 * The landing page's stats tile and employer strip.
 *
 * All three figures were hardcoded strings — "90", "9", "10" — written when the
 * seed held nine employers. The department taxonomy and the 27-company
 * catalogue moved the data out from under them and nothing failed, because
 * nothing was asserting. These tests exist so the next reseed cannot silently
 * make the page lie again: every number is asserted as a *derivation* of the
 * thing it claims to count, never as the literal it happens to equal today.
 */

const listing = {
  id: "job-1",
  title: "Frontend Engineer",
  description: "Build things.",
  requirements: ["typescript"],
  salary: 12,
  location: "Kolkata",
  jobType: "Full-time",
  position: 2,
  experienceLevel: 4,
  remote: false,
  createdAt: new Date().toISOString(),
  company: { id: "c1", name: "Northvale", logoUrl: null },
};

/** Stubs the one landing query both sections read. */
function mockLanding({ items = [], total = items.length } = {}) {
  return vi
    .spyOn(apiClient, "get")
    .mockResolvedValue({ data: { success: true, items, total, page: 1, pages: 1 } } as never);
}

/** Reads a stat cell's number by the label rendered beneath it. */
function statValue(label: string): string | null {
  return screen.getByText(label).parentElement?.querySelector("strong")?.textContent ?? null;
}

/**
 * A controllable IntersectionObserver. setup.ts stubs the global to an
 * observer that never fires — the honest off-screen state, since jsdom gives
 * every element a zero-sized box — so the figure's in-view gate can only be
 * driven from the test side. Instances register themselves rather than
 * capturing one callback because the carousel mounts several observers (its
 * category tracker, the figure's gate) and a single captured callback would
 * be whichever was constructed last.
 */
const observers: Array<{ fire: () => void }> = [];

function stubControllableObserver() {
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private targets: Element[] = [];
      constructor(private cb: IntersectionObserverCallback) {
        observers.push(this);
      }
      observe(target: Element): void {
        this.targets.push(target);
      }
      /** Reports every observed target as intersecting: the scroll-in. */
      fire(): void {
        // The carousel's own category observer sorts entries by
        // boundingClientRect.top, so the rect is not optional decoration —
        // an entry without one takes that observer down with a TypeError.
        const rect = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
        this.cb(
          this.targets.map((target) =>
            ({ isIntersecting: true, target, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: rect, time: 0 }) as IntersectionObserverEntry,
          ),
          this as unknown as IntersectionObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: readonly number[] = [];
    },
  );
}

/** The setup.ts stub again: what a test sees that never touched the global. */
function restoreNoopObserver() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: readonly number[] = [];
    },
  );
}

/** The MediaQueryList shape prefersReduced reads; matches is the only input. */
function mediaList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

afterEach(() => {
  // A firing observer must not leak into the next test: without this, the
  // gate is open from mount and every later assertion sees its end state.
  restoreNoopObserver();
  vi.restoreAllMocks();
});

/**
 * The value logic is a pure function rather than an inline ternary so the
 * empty and failed cases are assertable without a race: both render the same
 * dash the pending state does, so a DOM test for them would pass at t=0
 * whether or not the query ever resolved, and would keep passing if the wiring
 * broke entirely.
 */
describe("displayCount", () => {
  it("renders the count when there is one", () => {
    expect(displayCount(198)).toBe("198");
  });

  it("renders a dash rather than 0, which would advertise an empty marketplace", () => {
    expect(displayCount(0)).toBe("—");
  });

  it("renders a dash while the count is unknown, covering both loading and a failed request", () => {
    expect(displayCount(undefined)).toBe("—");
  });
});

describe("the landing stats tile", () => {
  it("takes its open-role count from the API and counts up when it scrolls into view", async () => {
    stubControllableObserver();
    mockLanding({ total: 198 });
    renderRoute(<CategoryCarousel />, { route: "/" });
    // The figure is the API's answer, held at zero until the tile is seen:
    // a count-up that fired while the tile was off-screen would be motion
    // nobody watched, and one that skipped the gate would never count at all.
    await waitFor(() => expect(statValue("open roles")).toBe("0"));
    act(() => {
      observers.forEach((observer) => observer.fire());
    });
    await waitFor(() => expect(statValue("open roles")).toBe("198"));
  });

  it("shows the open-role figure without waiting under reduced motion", async () => {
    mockLanding({ total: 198 });
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
      mediaList(query.includes("reduce")),
    );
    renderRoute(<CategoryCarousel />, { route: "/" });
    // No observer fires here. The gate collapses under the preference — the
    // figure is simply present, the same contract every reveal holds.
    await waitFor(() => expect(statValue("open roles")).toBe("198"));
  });

  it("counts verified teams from the catalogue, not a literal", async () => {
    mockLanding({ total: 198 });
    renderRoute(<CategoryCarousel />, { route: "/" });
    expect(statValue("verified teams")).toBe(String(CATALOGUE_COMPANIES.length));
  });

  it("counts disciplines to match the rows it actually lists", async () => {
    mockLanding({ total: 198 });
    const { container } = renderRoute(<CategoryCarousel />, { route: "/" });
    const rows = container.querySelectorAll("li[data-category-index]");
    expect(rows.length).toBeGreaterThan(0);
    expect(statValue("disciplines")).toBe(String(rows.length));
  });
});

describe("the employer strip", () => {
  it("presents itself as a selection, not the whole roster", async () => {
    mockLanding({ total: 198 });
    renderRoute(<CategoryCarousel />, { route: "/" });
    expect(screen.getByText("Featured teams")).toBeInTheDocument();
  });

  it("counts the logos it shows against the full roster", async () => {
    mockLanding({ total: 198 });
    const { container } = renderRoute(<CategoryCarousel />, { route: "/" });
    // The marquee renders the list twice to loop seamlessly, so the honest
    // numerator is how many distinct employers appear, not how many rows do.
    const shown = new Set(
      [...container.querySelectorAll(".employer-stream__row")].map((row) => row.textContent),
    );
    expect(shown.size).toBeGreaterThan(0);
    expect(
      screen.getByText(`${shown.size} of ${CATALOGUE_COMPANIES.length}`),
    ).toBeInTheDocument();
  });
});

describe("the landing sections share one request", () => {
  it("fetches the job list once for both consumers", async () => {
    const get = mockLanding({ total: 198 });
    renderRoute(
      <>
        <CategoryCarousel />
        <LatestJobs />
      </>,
      { route: "/" },
    );
    const jobCalls = get.mock.calls.filter(([url]) => String(url).startsWith("/job/get"));
    // Two components asking the same question must not cost two round trips;
    // that is the entire reason the query is keyed rather than per-component.
    //
    // The wait target is the figure, not the fetch: the query resolving is
    // what moves it from the dash to zero (held at the in-view gate), so
    // "0" here is the resolved state — the shared request has answered both.
    await waitFor(() => expect(statValue("open roles")).toBe("0"));
    expect(jobCalls).toHaveLength(1);
  });
});

describe("LatestJobs", () => {
  it("does not claim there are no openings while the request is still in flight", () => {
    // A promise that never settles is the pending state, held still.
    vi.spyOn(apiClient, "get").mockReturnValue(new Promise(() => {}) as never);
    renderRoute(<LatestJobs />, { route: "/" });
    // The empty list is the initial state of every load, so rendering the empty
    // state from `length === 0` flashed "No openings right now" on every visit.
    expect(screen.queryByText("No openings right now")).toBeNull();
  });

  it("still shows the empty state once the board really is empty", async () => {
    mockLanding({ items: [], total: 0 });
    renderRoute(<LatestJobs />, { route: "/" });
    expect(await screen.findByText("No openings right now")).toBeInTheDocument();
  });

  it("renders the jobs the landing query returned", async () => {
    mockLanding({ items: [listing], total: 1 });
    renderRoute(<LatestJobs />, { route: "/" });
    expect(await screen.findByText("Frontend Engineer")).toBeInTheDocument();
  });
});

describe("the job slice", () => {
  /**
   * `allJobs` was the landing list held in redux while react-query already
   * owned every other server read, and its only consumer was one component.
   * Same shape as the `searchedQuery` and `allAdminJobs` removals before it.
   */
  it("no longer carries the landing job list", async () => {
    const jobReducer = (await import("@/redux/jobSlice")).default;
    const state = jobReducer(undefined, { type: "@@INIT" });
    expect(state).not.toHaveProperty("allJobs");
  });

  it("has no reducer that can write it back", async () => {
    const jobReducer = (await import("@/redux/jobSlice")).default;
    const before = jobReducer(undefined, { type: "@@INIT" });
    const after = jobReducer(before, { type: "job/setAllJobs", payload: [listing] });
    expect(after).toEqual(before);
  });
});
