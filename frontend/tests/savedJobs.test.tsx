import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { JobDto, SavedJobDto } from "@jobportal/shared";

import { makeQueryClient, makeStore } from "./helpers/renderRoute";
import { apiClient } from "@/lib/apiClient";
import { setSingleJob } from "@/redux/jobSlice";
import { setUser } from "@/redux/authSlice";
import JobDescription from "@/components/JobDescription";
import SavedJobs from "@/components/SavedJobs";

const JOB = {
  id: "job-1",
  title: "A Full-time role",
  description: "Work.",
  requirements: [],
  salary: 12,
  location: "Remote",
  jobType: "Full-time",
  position: 1,
  department: "Engineering",
  experienceLevel: 1,
  remote: true,
  status: "open",
  company: { id: "c1", name: "Acme", logoUrl: null },
  createdAt: "2026-08-01T00:00:00.000Z",
  created_by: null,
  fit: null,
  postedBy: null,
};

const SEEKER = {
  id: "u1",
  portal: "seeker" as const,
  fullName: "A B",
  email: "a@b.co",
  emailVerified: true,
  avatarUrl: null,
  status: "active",
  profileComplete: true,
  hasPassword: true,
  isMinor: false,
  pendingEmailChange: null,
};

function renderDetail({ signedIn = true, saved = false, applied = false } = {}) {
  const store = makeStore();
  store.dispatch(setSingleJob(JOB as never));
  if (signedIn) store.dispatch(setUser(SEEKER as never));
  vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
    if (url === "/saved/job-1") return { data: { success: true, saved } } as never;
    if (url === "/application/applied/job-1") {
      return { data: { success: true, applied } } as never;
    }
    if (url.startsWith("/job/get/")) return { data: { success: true, job: JOB } } as never;
    throw new Error(`unexpected GET ${url}`);
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/description/job-1"]}>
          <Routes>
            <Route path="/description/:id" element={<JobDescription />} />
            <Route path="/login" element={<div data-testid="login" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the detail page's save control", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes an anonymous click to sign-in with a way back", async () => {
    renderDetail({ signedIn: false });
    await userEvent.click(await screen.findByRole("button", { name: /save role/i }));
    expect(await screen.findByTestId("login")).toBeInTheDocument();
  });

  it("shows Saved from the per-job read and unsaves on click", async () => {
    renderDetail({ saved: true });
    const button = await screen.findByRole("button", { name: /^Saved$/ });
    expect(button).toHaveAttribute("aria-pressed", "true");

    const remove = vi
      .spyOn(apiClient, "delete")
      .mockResolvedValue({ data: { success: true } } as never);
    await userEvent.click(button);
    expect(remove).toHaveBeenCalledWith("/saved/job-1");
  });

  it("saves on click when unsaved", async () => {
    renderDetail({ saved: false });
    const button = await screen.findByRole("button", { name: /save role/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    const add = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true } } as never);
    await userEvent.click(button);
    expect(add).toHaveBeenCalledWith("/saved/job-1");
  });

  it("reads the applied state per job, so the Apply button knows", async () => {
    renderDetail({ applied: true });
    expect(await screen.findByRole("button", { name: /application sent/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /apply for this role/i })).toBeNull();
  });
});

const openJob = (id: string, over: Partial<JobDto> = {}): JobDto =>
  ({
    id,
    title: `Role ${id}`,
    description: "Work.",
    requirements: [],
    salary: 12,
    location: "Remote",
    jobType: "Full-time",
    position: 1,
    department: "Engineering",
    experienceLevel: 1,
    remote: true,
    status: "open",
    company: { id: "c1", name: "Acme", logoUrl: null },
    createdAt: "2026-08-01T00:00:00.000Z",
    created_by: null,
    fit: null,
    postedBy: null,
    ...over,
  }) as JobDto;

function renderList(items: SavedJobDto[]) {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: { success: true, items, total: items.length, page: 1, pages: 1 },
  } as never);
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter>
          <SavedJobs />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the saved list", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the three row states with their markers", async () => {
    renderList([
      { id: "s1", jobId: "job-1", savedAt: "2026-08-20T10:00:00.000Z", job: openJob("job-1"), applied: false },
      {
        id: "s2",
        jobId: "job-2",
        savedAt: "2026-08-21T10:00:00.000Z",
        job: openJob("job-2", { title: "Closed Role", status: "closed" }),
        applied: true,
      },
      { id: "s3", jobId: "job-3", savedAt: "2026-08-22T10:00:00.000Z", job: null, applied: true },
    ]);

    // The open row links to its page.
    expect(await screen.findByRole("link", { name: /Role job-1/i })).toHaveAttribute(
      "href",
      "/description/job-1",
    );
    // The applied+closed row carries both facts — neither outweighs the other
    // — and the dead row is applied too: the join keys on the stored id, so
    // an application on a since-deleted job still counts.
    expect(screen.getAllByText("Applied")).toHaveLength(2);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // The deleted posting keeps its row, marked.
    expect(screen.getByText("No longer available")).toBeInTheDocument();
  });

  it("unsaves by the stored job id, so a dead row is removable too", async () => {
    renderList([
      { id: "s3", jobId: "job-3", savedAt: "2026-08-22T10:00:00.000Z", job: null, applied: true },
    ]);
    const remove = vi
      .spyOn(apiClient, "delete")
      .mockResolvedValue({ data: { success: true } } as never);

    await userEvent.click(await screen.findByRole("button", { name: /remove/i }));
    expect(remove).toHaveBeenCalledWith("/saved/job-3");
  });

  it("makes the empty state an invitation to browse", async () => {
    renderList([]);
    expect(await screen.findByText(/no saved roles yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse open roles/i })).toHaveAttribute("href", "/jobs");
  });
});
