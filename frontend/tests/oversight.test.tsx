import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { AdminRecruiterDto, AdminSeekerDto, PaginatedResponse } from "@jobportal/shared";

import AdminSeekers from "@/components/console/AdminSeekers";
import QueueApplicants from "@/components/workspace/QueueApplicants";
import { apiClient } from "@/lib/apiClient";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

function renderAt(element: React.ReactElement) {
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/x"]}>
          <Routes>
            <Route path="/x" element={element} />
            <Route path="/hire/jobs/:id/applicants" element={<div data-testid="per-job" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

const SEEKERS_PAGE: PaginatedResponse<AdminSeekerDto> = {
  items: [
    {
      id: "s1",
      fullName: "Adult Person",
      email: "adult@x.test",
      status: "active",
      minor: false,
      applicationCount: 3,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "s2",
      fullName: "Young Person",
      email: "young@x.test",
      status: "suspended",
      minor: true,
      applicationCount: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  pages: 1,
};

describe("the candidates oversight screen", () => {
  it("renders the listing with the minor badge and per-status actions", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, ...SEEKERS_PAGE },
    });
    renderAt(<AdminSeekers />);

    expect(await screen.findByText("Adult Person")).toBeTruthy();
    expect(screen.getByText("Young Person")).toBeTruthy();
    expect(screen.getByText("Under 18")).toBeTruthy();
    // Active row: suspend offered. Suspended row: reinstate offered.
    expect(screen.getAllByRole("button", { name: /^suspend/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^reinstate/i })).toHaveLength(1);
    // The hand-written projection means no DOB ever renders.
    expect(screen.queryByText(/1995-|2010-/)).toBeNull();
    get.mockRestore();
  });

  it("suspends through the reason dialog", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, ...SEEKERS_PAGE },
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } });
    renderAt(<AdminSeekers />);

    await screen.findByText("Adult Person");
    await userEvent.click(screen.getByRole("button", { name: /^suspend/i }));
    await userEvent.type(screen.getByLabelText(/^reason/i), "Spam applications.");
    // The dialog's confirm is the last Suspend button in the DOM (after the
    // row's own); the icon inside makes its accessible name richer than the
    // bare word.
    const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
    await userEvent.click(suspendButtons[suspendButtons.length - 1]!);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/seekers/s1/suspend", {
        reason: "Spam applications.",
      }),
    );
    get.mockRestore();
    post.mockRestore();
  });
});

const RECRUITERS_PAGE: PaginatedResponse<AdminRecruiterDto> = {
  items: [
    {
      id: "r1",
      fullName: "Pending Person",
      email: "pending@x.test",
      status: "pending",
      jobCount: 0,
      applicationCount: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "r2",
      fullName: "Active Person",
      email: "active@x.test",
      status: "active",
      jobCount: 2,
      applicationCount: 5,
      createdAt: "2026-08-02T00:00:00.000Z",
    },
    {
      id: "r3",
      fullName: "Suspended Person",
      email: "susp@x.test",
      status: "suspended",
      jobCount: 1,
      applicationCount: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
    },
  ],
  total: 3,
  page: 1,
  pages: 1,
};

describe("the recruiters monitoring screen", () => {
  it("carries the queue's actions on pending rows and the monitor's on the rest", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, ...RECRUITERS_PAGE },
    });
    const { default: AdminRecruiters } = await import(
      "@/components/console/AdminRecruiters"
    );
    renderAt(<AdminRecruiters />);

    expect(await screen.findByText("Pending Person")).toBeTruthy();
    // The queue's own pair, on exactly the pending row.
    expect(screen.getAllByRole("button", { name: /^approve/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^deny/i })).toHaveLength(1);
    // The monitor's pair: active gets suspend, suspended gets reinstate.
    expect(screen.getAllByRole("button", { name: /^suspend/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^reinstate/i })).toHaveLength(1);
    get.mockRestore();
  });
});

const QUEUE_PAGE: PaginatedResponse<{
  applicationId: string;
  status: "applied";
  appliedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  headline: string | null;
  skills: string[];
  resumeUrl: string | null;
  resumeName: string | null;
  fit: null;
  jobId: string;
  jobTitle: string;
  companyName: string | null;
}> = {
  items: [
    {
      applicationId: "a1",
      status: "applied",
      appliedAt: "2026-08-20T00:00:00.000Z",
      fullName: "Queue Person",
      email: "queue@x.test",
      phone: null,
      headline: null,
      skills: [],
      resumeUrl: null,
      resumeName: null,
      fit: null,
      jobId: "job-9",
      jobTitle: "Queued Role",
      companyName: "Acme",
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
};

describe("the recruiter's cross-job queue", () => {
  it("lists the application with its job, linking to the per-job screen", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, ...QUEUE_PAGE },
    });
    renderAt(<QueueApplicants />);

    expect(await screen.findByText("Queue Person")).toBeTruthy();
    const jobLink = screen.getByRole("link", { name: /queued role/i });
    expect(jobLink).toHaveAttribute("href", "/hire/jobs/job-9/applicants");
    expect(screen.getByText("1 person across all your roles.")).toBeTruthy();
    get.mockRestore();
  });

  it("says so when there is nothing in the queue", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: [], total: 0, page: 1, pages: 0 },
    });
    renderAt(<QueueApplicants />);

    expect(await screen.findByText("No applicants yet")).toBeTruthy();
    get.mockRestore();
  });
});
