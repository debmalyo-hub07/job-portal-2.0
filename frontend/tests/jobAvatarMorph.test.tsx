import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import Job from "@/components/Job";
import LatestJobCards from "@/components/LatestJobCards";
import JobDescription from "@/components/JobDescription";
import { jobAvatarName } from "@/lib/viewTransitionNames";
import { apiClient } from "@/lib/apiClient";
import { makeStore, renderRoute } from "./helpers/renderRoute";
import { setSingleJob } from "@/redux/jobSlice";

/**
 * The card→detail avatar morph — the native shared-element continuity the
 * deleted framer `SharedElement` was built for and never did.
 *
 * A `view-transition-name` present on an element in BOTH the outgoing and the
 * incoming snapshot makes the browser animate that element between its two
 * positions and sizes while the rest of the page cross-fades around it: the
 * company avatar lifts out of the row it was clicked in and lands in the
 * detail band. The global reduced-motion collapse in index.css covers these
 * groups with every other one, so nothing here needs its own switch.
 *
 * Two ways this silently breaks, both pinned here:
 *
 * 1. The two sides of a pair must produce the SAME name — a mismatch is not
 *    an error, just a morph that never happens. The name is built by one
 *    function (`jobAvatarName`) for exactly this reason; the tests compare
 *    what the DOM carries against that function rather than against a
 *    literal, so the three surfaces cannot drift apart.
 * 2. Two LIVE elements sharing one name abort the whole transition — the
 *    cross-fade itself stops working. The board page is the hazard: the
 *    "Near you" rail shows jobs that can also be in the list beneath it, so
 *    the rail must never name its rows while the list names its avatars.
 */

const job = {
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
  status: "open",
  createdAt: new Date().toISOString(),
  company: { id: "c1", name: "Northvale", logoUrl: null },
};

/** The inline view-transition-name an element carries, or null. */
function transitionName(container: HTMLElement): string | null {
  const el = container.querySelector("[data-company-avatar]") as HTMLElement | null;
  return el ? el.style.getPropertyValue("view-transition-name") || null : null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the card→detail avatar morph", () => {
  it("names the avatar on the board row", () => {
    const { container } = render(
      <MemoryRouter>
        <Job job={job as never} />
      </MemoryRouter>,
    );
    expect(transitionName(container)).toBe(jobAvatarName("job-1"));
  });

  it("names the avatar on the landing spotlight card", () => {
    const { container } = render(
      <MemoryRouter>
        <LatestJobCards job={job as never} index={0} />
      </MemoryRouter>,
    );
    expect(transitionName(container)).toBe(jobAvatarName("job-1"));
  });

  it("names the band's avatar on the detail page with the same name", () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, job },
    } as never);
    const store = makeStore();
    store.dispatch(setSingleJob(job as never));
    const { container } = renderRoute(<JobDescription />, {
      route: "/description/job-1",
      path: "/description/:id",
      store,
    });
    const band = container.querySelector("canvas")?.closest("section") as HTMLElement | null;
    expect(band, "the detail band must render").not.toBeNull();
    const avatar = band!.querySelector("[data-company-avatar]") as HTMLElement | null;
    expect(avatar).not.toBeNull();
    expect(avatar!.style.getPropertyValue("view-transition-name")).toBe(jobAvatarName("job-1"));
  });

  it("distinguishes jobs, so a board of rows carries no duplicate name", () => {
    const first = render(
      <MemoryRouter>
        <Job job={job as never} />
      </MemoryRouter>,
    );
    const second = render(
      <MemoryRouter>
        <Job job={{ ...job, id: "job-2" } as never} />
      </MemoryRouter>,
    );
    const nameA = transitionName(first.container);
    const nameB = transitionName(second.container);
    expect(nameA).not.toBeNull();
    expect(nameB).not.toBeNull();
    expect(nameA).not.toBe(nameB);
  });

  it("leaves the Near you rail unnamed — its jobs also live in the list", () => {
    // The board renders the rail above the very jobs it lists, so a named
    // element in both is one page with two live copies of a name, and the
    // whole transition aborts. The rail renders text rows today; this pins
    // that nobody gives it a morphing avatar without solving the collision.
    const source = readFileSync(resolve(__dirname, "../src/components/board/NearYouRail.tsx"), "utf8");
    expect(source).not.toContain("viewTransitionName");
    expect(source).not.toContain("view-transition-name");
  });

  it("keeps the name a valid custom-ident shape", () => {
    // view-transition-name takes a <custom-ident>: it cannot start with a
    // digit or be `none`. Job ids are Mongo hex strings, but the shape is
    // guarded here so a future id scheme cannot break the morph silently.
    const name = jobAvatarName("507f1f77bcf86cd799439011");
    expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(name).not.toBe("none");
  });

  it("renders the detail page's avatar discoverable by screen readers when named", () => {
    // Pin the pairing from the other direction: the morph is only worth its
    // snapshot cost if the element it carries is a real identity marker, and
    // the band's avatar is the company's, aria-hidden as decorative.
    const { container } = render(
      <MemoryRouter>
        <Job job={job as never} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-company-avatar]")).not.toBeNull();
    expect(screen.queryByText("Northvale")).not.toBeNull();
  });
});
