import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { NearMeJobDto } from "@jobportal/shared";

import { NearYouRail } from "@/components/board/NearYouRail";
import { apiClient } from "@/lib/apiClient";
import { setUser } from "@/redux/authSlice";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

const SEEKER_USER = {
  id: "s1",
  portal: "seeker" as const,
  fullName: "Seeker Person",
  email: "s@x.test",
  status: "active" as const,
  emailVerified: true,
  profileComplete: true,
  isMinor: false,
  hasPassword: true,
  pendingEmailChange: null,
  avatarUrl: null,
};

const JOBS: NearMeJobDto[] = [
  {
    id: "j1", title: "Fresh Bengaluru", description: "d", requirements: [], salary: 20,
    experienceLevel: 3, location: "Bengaluru", jobType: "Full-time", department: "Engineering",
    position: "1", remote: false, company: { id: "c1", name: "Acme", description: null, website: null, location: "Bengaluru", logoUrl: null, createdAt: "" },
    createdAt: new Date().toISOString(), status: "open", postedBy: null, band: "same_city",
  },
  {
    id: "j2", title: "Remote role", description: "d", requirements: [], salary: 20,
    experienceLevel: 3, location: "Delhi NCR", jobType: "Full-time", department: "Engineering",
    position: "1", remote: true, company: null,
    createdAt: new Date().toISOString(), status: "open", postedBy: null, band: "remote",
  },
];

function renderRail(signedIn = true) {
  const store = makeStore();
  if (signedIn) store.dispatch(setUser(SEEKER_USER));
  return render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter>
          <NearYouRail />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the Near you rail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("renders nothing for a signed-out visitor", async () => {
    const get = vi.spyOn(apiClient, "get");
    renderRail(false);
    expect(screen.queryByTestId("near-you-rail")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("renders ranked rows with seeker-relative band labels", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: JOBS, total: 2, page: 1, pages: 1 },
    });
    renderRail();

    const rail = await screen.findByTestId("near-you-rail");
    expect(rail).toHaveTextContent("Fresh Bengaluru");
    expect(rail).toHaveTextContent("Your city");
    expect(rail).toHaveTextContent("Remote");
  });

  it("offers the one-time consent prompt when no area exists, and the flow completes into the rail", async () => {
    let located = false;
    vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
      if (url.startsWith("/location/reverse")) {
        return { data: { success: true, city: "Bengaluru", country: "IN", matched: true, region: "Karnataka", source: "openstreetmap" } };
      }
      if (url === "/job/near-me") {
        if (!located) {
          const err = new Error("no location") as Error & { response?: { data?: { code?: string } } };
          err.response = { data: { code: "NEAR_ME_NO_LOCATION" } };
          throw err;
        }
        return { data: { success: true, items: JOBS, total: 2, page: 1, pages: 1 } };
      }
      throw new Error(`unexpected ${url}`);
    });
    const post = vi.spyOn(apiClient, "post").mockImplementation(async (url: string) => {
      if (url === "/user/profile/update") {
        located = true;
        return { data: { success: true } };
      }
      throw new Error(`unexpected post ${url}`);
    });

    renderRail();
    expect(await screen.findByTestId("near-you-prompt")).toBeTruthy();

    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 12.97, longitude: 77.59 } }),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    vi.unstubAllGlobals();

    // Consent → reverse → profile save → the invalidated query re-ranks.
    await waitFor(() => expect(post).toHaveBeenCalledWith("/user/profile/update", expect.any(FormData)));
    const rail = await screen.findByTestId("near-you-rail");
    expect(rail).toHaveTextContent("Fresh Bengaluru");
  });

  it("hides the prompt on dismissal and remembers it", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async () => {
      const err = new Error("no location") as Error & { response?: { data?: { code?: string } } };
      err.response = { data: { code: "NEAR_ME_NO_LOCATION" } };
      throw err;
    });
    renderRail();
    expect(await screen.findByTestId("near-you-prompt")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("near-you-prompt")).toBeNull();
    expect(window.localStorage.getItem("near-me-prompt-dismissed")).toBe("1");
  });
});
