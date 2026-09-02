import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";

import Applicants from "@/components/workspace/Applicants";
import { makeStore } from "./helpers/renderRoute";

// The hook is the whole world here: the screen only reads what it returns.
vi.mock("@/hooks/useRecruiterWorkspace", () => ({
  useApplicants: () => ({
    data: {
      items: [
        {
          applicationId: "a1",
          status: "shortlisted" as const,
          appliedAt: "2026-09-02T10:00:00.000Z",
          fullName: "Mira Patel",
          email: "mira@northstarlabs.example",
          phone: null,
          headline: null,
          skills: [],
          resumeUrl: null,
          resumeName: null,
          fit: null,
        },
      ],
      funnel: {
        applied: 2,
        reviewed: 0,
        shortlisted: 1,
        interview: 0,
        offered: 7,
        rejected: 0,
        withdrawn: 0,
      },
      total: 10,
      page: 1,
      pages: 4,
    },
    isPending: false,
    isError: false,
    error: null,
    setPage: vi.fn(),
  }),
  useApplicantDecision: () => ({ mutateAsync: vi.fn() }),
  useBulkApplicantDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useJob: () => ({ data: undefined }),
}));

describe("the applicants pipeline funnel (P5)", () => {
  it("renders every stage's count across the whole set, in pipeline order", () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Applicants />
        </MemoryRouter>
      </Provider>,
    );

    const strip = screen.getByRole("list", { name: /pipeline/i });
    const text = strip.textContent ?? "";
    // The active pipeline, in order, then the terminal pair.
    const order = ["Applied", "Reviewed", "Shortlisted", "Interview", "Offered"];
    let last = -1;
    for (const stage of order) {
      const at = text.indexOf(stage);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(text).toContain("Not selected");
    expect(text).toContain("Withdrawn");

    // The counts are the whole set's (offered 7 appears only in the strip —
    // the page holds one applicant and the total reads 10).
    expect(strip.textContent).toContain("7");
    expect(strip.textContent).toContain("2");
  });
});
