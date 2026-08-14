import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderAppAt, renderRoute } from "./helpers/renderRoute";
import FilterCard from "@/components/FilterCard";
import Job from "@/components/Job";
import { navLinksFor } from "@/components/shared/navLinks";
import { jobBoardPath } from "@/hooks/useJobSearch";
import jobReducer from "@/redux/jobSlice";

/**
 * 2B-2: the seeker board.
 *
 * The phase collapsed two job lists into one. `/browse` was the pre-4B board —
 * keyword-only, redux-backed, no facets, no pagination, no loading state — and
 * it was where the hero search and every category chip sent the user, so the
 * faceted board built in 4B was reachable only by clicking "Jobs" directly.
 * These tests pin the collapse so it cannot quietly come back.
 */

describe("the retired /browse board", () => {
  it("redirects to /jobs", async () => {
    const at = renderAppAt("/browse");
    await waitFor(() => expect(at.pathname()).toBe("/jobs"));
  });

  it("carries the search across, so a shared /browse link keeps its keyword", async () => {
    const at = renderAppAt("/browse?keyword=react&location=Pune");
    await waitFor(() => expect(at.pathname()).toBe("/jobs"));
    // Dropping the query would silently turn a shared filtered search into the
    // unfiltered board, which looks like it worked.
    expect(at.search()).toBe("?keyword=react&location=Pune");
  });

  it("is gone from the seeker navigation", () => {
    const targets = navLinksFor("seeker").map((l) => l.to);
    expect(targets).toContain("/jobs");
    expect(targets).not.toContain("/browse");
  });
});

describe("jobBoardPath", () => {
  it("builds a /jobs URL carrying the keyword", () => {
    expect(jobBoardPath("react")).toBe("/jobs?keyword=react");
  });

  it("encodes a multi-word role rather than emitting a raw space", () => {
    expect(jobBoardPath("Frontend Developer")).toBe("/jobs?keyword=Frontend+Developer");
  });

  it("omits the param entirely for an empty or whitespace search", () => {
    expect(jobBoardPath("")).toBe("/jobs");
    expect(jobBoardPath("   ")).toBe("/jobs");
  });
});

describe("the redux search field", () => {
  /**
   * `searchedQuery` was the board's filter state before 4B moved it to the URL.
   * Leaving it in place after the move left two sources of truth for one
   * question — and its last reader, the landing page's "Latest openings",
   * filtered itself by a stale search while its heading still said "latest".
   */
  it("is gone from the job slice", () => {
    const state = jobReducer(undefined, { type: "@@INIT" });
    expect(state).not.toHaveProperty("searchedQuery");
  });

  it("no longer has a reducer, so nothing can write it back", () => {
    const before = jobReducer(undefined, { type: "@@INIT" });
    const after = jobReducer(before, { type: "job/setSearchedQuery", payload: "react" });
    expect(after).toEqual(before);
  });
});

describe("FilterCard", () => {
  it("renders controls for salary, experience and remote", () => {
    renderRoute(<FilterCard />, { route: "/jobs" });
    // All three were in `clearAll` and the has-filters check from 4B on, while
    // no control rendered for any of them — so "Clear all" could appear for a
    // filter the rail gave the user no way to set.
    expect(screen.getByLabelText("Up to ₹10L")).toBeInTheDocument();
    expect(screen.getByLabelText("Up to 5 years")).toBeInTheDocument();
    expect(screen.getByLabelText("Remote only")).toBeInTheDocument();
  });

  it("offers an explicit Any option for each ceiling", () => {
    renderRoute(<FilterCard />, { route: "/jobs" });
    // Rather than click-to-unset, which cannot be reached from the keyboard and
    // would depend on onClick firing before onChange for a radio.
    expect(screen.getByLabelText("Any salary")).toBeChecked();
    expect(screen.getByLabelText("Any experience")).toBeChecked();
  });

  it("reflects the URL rather than holding filter state of its own", () => {
    // `path` passed explicitly: renderRoute defaults it to `route`, and a route
    // *path* carrying a query string matches nothing.
    renderRoute(<FilterCard />, {
      route: "/jobs?salaryMax=20&remote=true&location=Pune",
      path: "/jobs",
    });
    expect(screen.getByLabelText("Up to ₹20L")).toBeChecked();
    expect(screen.getByLabelText("Remote only")).toBeChecked();
    expect(screen.getByLabelText("Pune")).toBeChecked();
    expect(screen.getByLabelText("Any salary")).not.toBeChecked();
  });

  it("shows Clear all only when a filter is set", () => {
    const { unmount } = renderRoute(<FilterCard />, { route: "/jobs" });
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
    unmount();

    renderRoute(<FilterCard />, { route: "/jobs?remote=true", path: "/jobs" });
    expect(screen.getByRole("button", { name: /clear all/i })).toBeInTheDocument();
  });

  it("keeps the keyword when clearing filters", async () => {
    const at = renderAppAt("/jobs?keyword=react&remote=true");
    fireEvent.click(await screen.findByRole("button", { name: /clear all/i }));
    // Clearing the filters is not asking to abandon the search that got you
    // here — the keyword came from the hero box or a shared link.
    await waitFor(() => expect(at.search()).toBe("?keyword=react"));
  });

  it("drops the page when a filter changes", async () => {
    const at = renderAppAt("/jobs?page=4");
    fireEvent.click(await screen.findByLabelText("Remote only"));
    // Page 4 of the old result set means nothing in the new one.
    await waitFor(() => expect(at.search()).toBe("?remote=true"));
  });

  it("filters on the same vocabulary the job form posts", async () => {
    const { JOB_TYPES } = await import("@jobportal/shared");
    renderRoute(<FilterCard />, { route: "/jobs" });
    // A hardcoded copy here is how the form and the facet drifted on casing.
    for (const type of JOB_TYPES) {
      expect(screen.getByLabelText(type)).toBeInTheDocument();
    }
  });
});

describe("the job card", () => {
  const job = {
    id: "job-1",
    title: "Senior Frontend Engineer",
    description: "Build things.",
    requirements: ["React"],
    salary: 32,
    location: "Bengaluru",
    jobType: "Full-time",
    position: 2,
    experienceLevel: 4,
    remote: false,
    createdAt: new Date().toISOString(),
    company: { id: "c1", name: "Northvale", logoUrl: null },
  };

  it("has no control that does nothing", () => {
    // The Bookmark button and "Save For Later" both rendered as real controls
    // and called nothing at all. Saved jobs is unbuilt; a control that silently
    // ignores a click is worse than an absent one.
    const { container } = renderRoute(<Job job={job as never} />, { route: "/jobs" });
    expect(within(container).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/save for later/i)).not.toBeInTheDocument();
  });

  it("is a single link to the job", () => {
    const { container } = renderRoute(<Job job={job as never} />, { route: "/jobs" });
    const links = within(container).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/description/job-1");
  });

  it("falls back to company initials when there is no logo", () => {
    renderRoute(<Job job={job as never} />, { route: "/jobs" });
    // AvatarImage renders nothing for a null src; without a sibling fallback
    // the card showed an empty circle.
    expect(screen.getByText("No")).toBeInTheDocument();
  });
});

describe("the seeker board page", () => {
  it("names itself with a heading", async () => {
    renderAppAt("/jobs");
    // The page opened straight onto a filter rail and a grid before 2B-2, so a
    // screen reader landed on a surface with no accessible name.
    expect(await screen.findByRole("heading", { level: 1, name: /open roles/i })).toBeInTheDocument();
  });

  it("names the search in its heading when one is active", async () => {
    renderAppAt("/jobs?keyword=react");
    expect(
      await screen.findByRole("heading", { level: 1, name: /jobs matching "react"/i }),
    ).toBeInTheDocument();
  });

  /**
   * The navbar wordmark was an `<h1>`, so every page in the application had two
   * top-level headings — the site name and the page's own title. A screen-reader
   * user navigating by heading hit "JobPortal" first on every route. AuthLayout
   * had already settled this by rendering its wordmark as a span.
   */
  it.each(["/jobs", "/", "/jobs?keyword=react"])(
    "has exactly one h1 at %s",
    async (entry) => {
      renderAppAt(entry);
      await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1));
    },
  );
});

describe("the landing page's latest openings", () => {
  it("asks for the latest jobs with no keyword", async () => {
    // The hook passed the redux `searchedQuery` as `keyword`, so after a search
    // the section showed filtered results under a "Latest openings" heading.
    const get = vi.fn().mockResolvedValue({ data: { success: true, items: [] } });
    vi.doMock("@/lib/apiClient", () => ({ apiClient: { get } }));
    vi.resetModules();

    const { default: useGetAllJobs } = await import("@/hooks/useGetAllJobs");
    const { renderHook } = await import("@testing-library/react");
    const { Provider } = await import("react-redux");
    const { makeStore } = await import("./helpers/renderRoute");
    const store = makeStore();

    renderHook(() => useGetAllJobs(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    await waitFor(() => expect(get).toHaveBeenCalled());
    const [, config] = get.mock.calls[0];
    expect(config.params).not.toHaveProperty("keyword");

    vi.doUnmock("@/lib/apiClient");
    vi.resetModules();
  });
});
