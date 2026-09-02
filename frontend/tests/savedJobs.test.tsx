import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

import { makeQueryClient, makeStore } from "./helpers/renderRoute";
import { apiClient } from "@/lib/apiClient";
import { setSingleJob } from "@/redux/jobSlice";
import { setUser } from "@/redux/authSlice";
import JobDescription from "@/components/JobDescription";

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

function renderDetail({ signedIn = true, saved = false } = {}) {
  const store = makeStore();
  store.dispatch(setSingleJob(JOB as never));
  if (signedIn) store.dispatch(setUser(SEEKER as never));
  vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
    if (url === "/saved/job-1") return { data: { success: true, saved } } as never;
    if (url.startsWith("/job/get/")) return { data: { success: true, job: JOB } } as never;
    if (url === "/application/get") {
      return { data: { success: true, items: [], total: 0, page: 1, pages: 0 } } as never;
    }
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
});
