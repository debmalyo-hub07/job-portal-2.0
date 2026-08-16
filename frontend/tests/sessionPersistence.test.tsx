import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import { Provider } from "react-redux";
import { render, waitFor } from "@testing-library/react";

import { apiClient } from "@/lib/apiClient";
import { clearPortalHint, setPortalHint } from "@/lib/portal";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { setUser } from "@/redux/authSlice";
import { makeStore } from "./helpers/renderRoute";

function BootstrapProbe() {
  useAuthBootstrap();
  return null;
}

afterEach(() => {
  clearPortalHint();
  vi.restoreAllMocks();
});

describe("session persistence", () => {
  it("recovers the portal from the cached session when the standalone hint is missing", async () => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "seeker-1",
        portal: "seeker",
        fullName: "Seeker",
        email: "seeker@example.test",
        emailVerified: true,
        avatarUrl: null,
        status: "active",
      }),
    );
    clearPortalHint();
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        user: store.getState().auth.user,
        csrfToken: "csrf.next",
      },
    } as never);

    render(
      <Provider store={store}>
        <BootstrapProbe />
      </Provider>,
    );

    await waitFor(() => expect(get).toHaveBeenCalledWith("/seeker/auth/me"));
  });

  it("refreshes the tab's active portal even when another tab changes localStorage", async () => {
    setPortalHint("recruiter");
    // A different tab signs into admin. This changes shared storage, but must
    // not retarget an already-running recruiter tab's token refresh.
    localStorage.setItem("jp.portal", "admin");

    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, csrfToken: "csrf.rotated" },
    } as never);
    const adapter = vi.fn().mockResolvedValue({
      data: { success: true },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    });

    const responseInterceptors = apiClient.interceptors.response as unknown as {
      handlers: Array<{
        rejected: (error: unknown) => Promise<unknown>;
      }>;
    };
    const rejected = responseInterceptors.handlers[0]?.rejected;
    expect(rejected).toBeTypeOf("function");

    await rejected!({
      config: {
        url: "/company/get",
        method: "get",
        headers: new AxiosHeaders(),
        adapter,
      },
      response: { status: 401 },
    });

    expect(post).toHaveBeenCalledWith("/recruiter/auth/refresh");
  });
});
