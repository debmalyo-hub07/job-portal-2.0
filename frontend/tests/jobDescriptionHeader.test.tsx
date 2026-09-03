import { describe, expect, it, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";

import JobDescription from "@/components/JobDescription";
import { apiClient } from "@/lib/apiClient";
import { makeStore, renderRoute } from "./helpers/renderRoute";
import { setSingleJob } from "@/redux/jobSlice";

/**
 * The detail page's header band — the last flat public surface, composed in
 * the phase's language: a full-bleed paper-ground Atmosphere behind the
 * header, at the standard tier's half amplitude, with the reading content
 * below it. jsdom cannot paint the field, so what is asserted is the
 * structure that decides what the browser paints: the tier the amplitude
 * resolves through, the band that carries both the field and the page's h1,
 * and the content that must stay out of it.
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

function mountDetail() {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: { success: true, job },
  } as never);
  const store = makeStore();
  store.dispatch(setSingleJob(job as never));
  return renderRoute(<JobDescription />, {
    route: "/description/job-1",
    path: "/description/:id",
    store,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the job detail header band", () => {
  it("runs the standard tier, so the field paints at half amplitude", () => {
    const { container } = mountDetail();
    // renderRoute wraps the page in PortalScope's own div, so the page root is
    // found by the tier attribute, not by position.
    const root = container.querySelector("[data-motion='standard']") as HTMLElement;
    expect(root).not.toBeNull();
    // The tier's vars are inline, so jsdom can read the amplitude the shader
    // would resolve — half of the root switch, the documented "behind content
    // someone is reading" size.
    expect(getComputedStyle(root).getPropertyValue("--motion-ambient-amplitude")).toBe(
      "calc(var(--motion-ambient) * 0.5)",
    );
  });

  it("carries the field and the page's heading in one full-bleed band", () => {
    const { container } = mountDetail();
    const root = container.querySelector("[data-motion='standard']") as HTMLElement;
    // The page's only canvas is the Atmosphere host's.
    const canvas = root.querySelector("canvas");
    expect(canvas, "the header band must mount an Atmosphere field").not.toBeNull();
    const band = canvas!.closest("section");
    expect(band).not.toBeNull();
    // The heading lives inside the band — the field is behind the title, not
    // behind the reading content below it.
    expect(band!.querySelector("h1")).not.toBeNull();
    // And the band is the page root's first child, ahead of the content
    // container: full-bleed, like the landing sections, not inside the column.
    expect(root.firstElementChild).toBe(band);
  });

  it("keeps the reading content and the apply card out of the band", () => {
    const { container } = mountDetail();
    const band = container.querySelector("[data-motion='standard'] canvas")!.closest("section");
    expect(band!.textContent).not.toContain("About the role");
    // The action card belongs to the content it acts on; sticky needs the tall
    // container, and a field behind a button the user is aiming at is noise.
    const apply = screen.getByRole("button", { name: "Apply for this role" });
    expect(band!.contains(apply)).toBe(false);
  });
});
