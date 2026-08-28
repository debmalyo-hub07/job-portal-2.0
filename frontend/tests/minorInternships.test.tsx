import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ProfileResponse } from "@jobportal/shared";

import CompleteProfile from "@/components/identity/CompleteProfile";
import JobDescription from "@/components/JobDescription";
import { setSingleJob } from "@/redux/jobSlice";
import { setUser } from "@/redux/authSlice";
import { apiClient } from "@/lib/apiClient";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

const PASSWORD = "correct horse battery staple";

function apiRejection(code: string, message: string, status = 400): AxiosError {
  return new AxiosError(message, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { success: false, code, message },
  } as never);
}

/** The profile the completion step gets back for a minor's saved DOB. */
const minorProfile: ProfileResponse["profile"] = {
  user: {
    id: "u1",
    portal: "seeker",
    fullName: "Young Person",
    email: "young@x.test",
    emailVerified: true,
    avatarUrl: null,
    status: "active",
    profileComplete: false,
    hasPassword: true,
    isMinor: true,
    pendingEmailChange: null,
  },
  phone: null,
  dob: "2010-01-01",
  gender: null,
  minor: true,
  guardianEmail: null,
  seeker: null,
  recruiter: null,
  admin: null,
};

function renderComplete() {
  const store = makeStore();
  const view = render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={["/complete-profile"]}>
          <Routes>
            <Route path="/complete-profile" element={<CompleteProfile portal="seeker" />} />
            <Route path="/jobs" element={<div data-testid="jobs" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return { view, store };
}

describe("the guardian stage", () => {
  it("renders after a minor's identity block saves, and not before", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, profile: minorProfile },
    });
    const { store } = renderComplete();

    // Not rendered for the identity step itself.
    expect(screen.queryByLabelText(/guardian's email address/i)).toBeNull();

    await userEvent.type(screen.getByLabelText(/^date of birth/i), "2010-01-01");
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));

    expect(await screen.findByLabelText(/guardian's email address/i)).toBeTruthy();
    // The redirect did NOT happen — the gate's second exit.
    expect(screen.queryByTestId("jobs")).toBeNull();
    // And the store got the (incomplete) user, as every guard reads it.
    expect(store.getState().auth.user?.profileComplete).toBe(false);
    expect(post).toHaveBeenCalledWith("/user/profile/complete", { dob: "2010-01-01" });
    post.mockRestore();
  });

  it("sends the code to the guardian's address, then confirms and lands", async () => {
    const post = vi.spyOn(apiClient, "post").mockImplementation(async (url) => {
      if (String(url).endsWith("/profile/complete")) {
        return { data: { success: true, profile: minorProfile } };
      }
      return { data: { success: true, message: "sent" } };
    });
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        user: { ...minorProfile.user, profileComplete: true, isMinor: true },
      },
    });
    const { store } = renderComplete();

    await userEvent.type(screen.getByLabelText(/^date of birth/i), "2010-01-01");
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));
    await screen.findByLabelText(/guardian's email address/i);

    await userEvent.type(screen.getByLabelText(/guardian's email address/i), "guardian@family.test");
    await userEvent.click(screen.getByRole("button", { name: /send the code/i }));
    await screen.findByLabelText(/code from your guardian/i);

    await userEvent.type(screen.getByLabelText(/code from your guardian/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

    await waitFor(() => expect(screen.getByTestId("jobs")).toBeTruthy());
    expect(post).toHaveBeenCalledWith("/user/guardian-consent", {
      email: "guardian@family.test",
    });
    expect(post).toHaveBeenCalledWith("/user/guardian-consent/confirm", { code: "123456" });
    expect(store.getState().auth.user?.profileComplete).toBe(true);
    post.mockRestore();
    get.mockRestore();
  });

  it("an adult completes in one step and never sees the stage", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        success: true,
        profile: {
          ...minorProfile,
          minor: false,
          user: { ...minorProfile.user, profileComplete: true, isMinor: false },
        },
      },
    });
    renderComplete();

    await userEvent.type(screen.getByLabelText(/^date of birth/i), "1995-01-01");
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));

    await waitFor(() => expect(screen.getByTestId("jobs")).toBeTruthy());
    expect(screen.queryByLabelText(/guardian's email address/i)).toBeNull();
    post.mockRestore();
  });

  it("a recruiter age refusal keeps the form up rather than crashing", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockRejectedValue(
        apiRejection("RECRUITER_AGE_MINIMUM", "Recruiters must be 18 or over."),
      );
    const store = makeStore();
    render(
      <Provider store={store}>
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={["/hire/complete-profile"]}>
            <Routes>
              <Route
                path="/hire/complete-profile"
                element={<CompleteProfile portal="recruiter" />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>,
    );

    await userEvent.type(screen.getByLabelText(/^date of birth/i), "2010-01-01");
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));

    // The form stays on screen and re-enabled — the refusal is a toast, and
    // the person can correct the date and try again.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^continue/i })).not.toBeDisabled(),
    );
    expect(screen.getByLabelText(/^date of birth/i)).toBeTruthy();
    post.mockRestore();
  });
});

describe("the job detail page's minor guard", () => {
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

  function renderJob(isMinor: boolean) {
    const store = makeStore();
    store.dispatch(setSingleJob(JOB as never));
    store.dispatch(
      setUser({
        id: "u1",
        portal: "seeker",
        fullName: "A B",
        email: "a@b.co",
        emailVerified: true,
        avatarUrl: null,
        status: "active",
        profileComplete: true,
        hasPassword: true,
        isMinor,
        pendingEmailChange: null,
      }),
    );
    return render(
      <Provider store={store}>
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={["/description/job-1"]}>
            <Routes>
              <Route path="/description/:id" element={<JobDescription />} />
              <Route path="/jobs" element={<div data-testid="jobs" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>,
    );
  }

  it("tells a signed-in minor the role is not an internship, with a way out", () => {
    renderJob(true);
    expect(screen.getByText(/internships only/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /see internship roles/i })).toHaveAttribute(
      "href",
      "/jobs?jobType=Internship",
    );
    // No live Apply button that can only fail.
    expect(screen.queryByRole("button", { name: /apply for this role/i })).toBeNull();
  });

  it("offers the ordinary Apply button to an adult", () => {
    renderJob(false);
    expect(screen.getByRole("button", { name: /apply for this role/i })).toBeTruthy();
    expect(screen.queryByText(/internships only/i)).toBeNull();
  });
});
