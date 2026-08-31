import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ProfileResponse } from "@jobportal/shared";

import Profile from "@/components/Profile";
import { apiClient } from "@/lib/apiClient";
import { setBootstrapped } from "@/redux/authSlice";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

const PROFILE: ProfileResponse = {
  success: true,
  profile: {
    user: {
      id: "s1", portal: "seeker", fullName: "Seeker Person", email: "s@x.test",
      status: "active", emailVerified: true, profileComplete: true, isMinor: false,
      hasPassword: true, pendingEmailChange: null, avatarUrl: null,
    },
    phone: null, dob: null, gender: null, minor: false, guardianEmail: null,
    seeker: {
      headline: null, bio: null, skills: [], experienceYears: null, location: null,
      geoLocation: null, salaryMin: null, salaryMax: null, openToRemote: null,
      resumeUrl: null, resumeName: null,
    },
    recruiter: null, admin: null,
  },
};

function renderProfile() {
  const store = makeStore();
  store.dispatch(setBootstrapped(true));
  return render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <Profile />
      </QueryClientProvider>
    </Provider>,
  );
}

describe("the seeker profile's Your area card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Deliberately NO vi.unstubAllGlobals() here: it would also remove the
    // IntersectionObserver/ResizeObserver stubs tests/setup.ts installs, and
    // this page renders Reveal.
    vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
      if (url === "/user/profile") return { data: PROFILE };
      if (url.startsWith("/location/reverse")) {
        return {
          data: { success: true, city: "Bengaluru", country: "IN", matched: true, region: "Karnataka", source: "openstreetmap" },
        };
      }
      // The applied-jobs table's read.
      return { data: { success: true, items: [], total: 0, page: 1, pages: 0 } };
    });
  });

  it("detects, shows, and saves the consented city", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 12.97, longitude: 77.59 } }),
      },
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } });

    renderProfile();
    await userEvent.click(await screen.findByRole("button", { name: /use my location/i }));

    const row = await screen.findByTestId("profile-location");
    await waitFor(() => expect(row).toHaveTextContent(/Bengaluru, IN/));

    expect(post).toHaveBeenCalledWith("/user/profile/update", expect.any(FormData));
    const form = post.mock.calls[0]![1] as FormData;
    expect(form.get("geoLocation")).toBe(JSON.stringify({ city: "Bengaluru", country: "IN" }));
  });

  it("explains a refusal without saving anything", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          _ok: (p: { coords: { latitude: number; longitude: number } }) => void,
          err: (e: { code: number; message: string }) => void,
        ) => err({ code: 1, message: "denied" }),
      },
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } });

    renderProfile();
    await userEvent.click(await screen.findByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/browser said no/i)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the stored city from the profile without asking again", async () => {
    const stored = {
      ...PROFILE,
      profile: {
        ...PROFILE.profile,
        seeker: { ...PROFILE.profile.seeker!, geoLocation: { city: "Pune", country: "IN" } },
      },
    };
    vi.spyOn(apiClient, "get").mockImplementation(async (url: string) =>
      url === "/user/profile" ? { data: stored } : { data: { success: true, items: [], total: 0, page: 1, pages: 0 } },
    );

    renderProfile();
    const row = await screen.findByTestId("profile-location");
    await waitFor(() => expect(row).toHaveTextContent(/Pune, IN/));
    expect(screen.queryByRole("button", { name: /use my location/i })).toBeNull();
  });
});
