import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { SessionUser } from "@jobportal/shared";

import AuthComplete from "@/components/auth/AuthComplete";
import { PortalScope } from "@/components/theme/PortalScope";
import { apiClient } from "@/lib/apiClient";
import { makeQueryClient, makeStore } from "./helpers/renderRoute";

/**
 * The Google landing, which is where production's "Sign-in failed" came from.
 *
 * The server had already signed the user in — three times in one day — but the
 * session cookies were set on the callback's own top-level navigation to the API
 * host, and cross-site the browser never presented them to this page's request.
 * So `/me` 401'd and this component reported a failure on a successful sign-in.
 *
 * The fix moves the session onto a request THIS page makes: the callback hands
 * over a one-time code and the page redeems it. These tests pin that, and the
 * `/me` case is a regression guard — calling it here is the bug.
 */
const seekerUser: SessionUser = {
  id: "u1",
  portal: "seeker",
  fullName: "Ada Lovelace",
  email: "ada@x.test",
  emailVerified: true,
  avatarUrl: null,
  status: "active",
  profileComplete: true,
  hasPassword: true,
  isMinor: false,
  pendingEmailChange: null,
};

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc" data-pathname={pathname} data-search={search} />;
}

/** Mounts the landing at a real callback URL, with somewhere to land. */
function renderLanding(url: string) {
  const store = makeStore();
  render(
    <Provider store={store}>
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <PortalScope>
            <Routes>
              <Route path="/auth/complete" element={<AuthComplete />} />
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </PortalScope>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return store;
}

const landed = () => screen.getByTestId("loc").getAttribute("data-pathname");

describe("the Google landing redeems the handoff code", () => {
  it("exchanges the code on a request of its own and signs the user in", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, user: seekerUser, csrfToken: "csrf-1" },
    });
    // Passed through: AuthLayout's own open-roles counter uses this too, so the
    // guard below names the one request that must not happen rather than
    // forbidding GET outright.
    const get = vi.spyOn(apiClient, "get");

    const store = renderLanding("/auth/complete?portal=seeker&code=handoff-1");

    await waitFor(() => expect(landed()).toBe("/jobs"));
    expect(post).toHaveBeenCalledWith("/seeker/auth/google/exchange", {
      code: "handoff-1",
    });
    // The regression that mattered: a cookie the callback set is not ours to
    // read cross-site, so this page must never try to authenticate with one.
    const authenticated = get.mock.calls.map(([url]) => url).filter((url) => url.includes("/auth/"));
    expect(authenticated).toEqual([]);
    expect(store.getState().auth.user?.email).toBe("ada@x.test");
  });

  it("sends the recruiter's code to the recruiter exchange", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        success: true,
        user: { ...seekerUser, portal: "recruiter" },
        csrfToken: "csrf-1",
      },
    });

    renderLanding("/auth/complete?portal=recruiter&code=handoff-2");

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/recruiter/auth/google/exchange", {
        code: "handoff-2",
      }),
    );
  });

  it("takes an account with no date of birth to the identity step, not the board", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        success: true,
        user: { ...seekerUser, profileComplete: false },
        csrfToken: "csrf-1",
      },
    });

    renderLanding("/auth/complete?portal=seeker&code=handoff-3");

    await waitFor(() => expect(landed()).toBe("/complete-profile"));
  });

  it("reports a failure when the exchange is refused", async () => {
    vi.spyOn(apiClient, "post").mockRejectedValue(
      new AxiosError("nope", undefined, undefined, undefined, {
        status: 401,
        data: { success: false, code: "GOOGLE_HANDOFF_INVALID" },
      } as never),
    );

    renderLanding("/auth/complete?portal=seeker&code=spent-code");

    await waitFor(() => expect(landed()).toBe("/auth/error"));
    expect(screen.getByTestId("loc").getAttribute("data-search")).toContain(
      "code=GOOGLE_AUTH_FAILED",
    );
  });

  it("reports a failure when the redirect carries no code at all", async () => {
    const post = vi.spyOn(apiClient, "post");

    renderLanding("/auth/complete?portal=seeker");

    await waitFor(() => expect(landed()).toBe("/auth/error"));
    // Nothing to redeem, so nothing is sent — an empty exchange would only
    // spend a rate-limit slot to be told what we already know.
    expect(post).not.toHaveBeenCalled();
  });
});
