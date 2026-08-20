import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { render, waitFor } from "@testing-library/react";
import type { Portal } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";
import { clearPortalHint, setPortalHint } from "@/lib/portal";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import {
  portalIsBootstrapped,
  setPortalBootstrapped,
  setUser,
  userForPortal,
  type AuthState,
} from "@/redux/authSlice";
import { makeStore } from "./helpers/renderRoute";

function BootstrapProbe({ portal }: { portal?: Portal }) {
  useAuthBootstrap(portal);
  return null;
}

afterEach(() => {
  clearPortalHint();
  vi.restoreAllMocks();
});

describe("session persistence", () => {
  it("bootstraps an explicit portal once after /me restores its session", async () => {
    const store = makeStore();
    setPortalHint("recruiter");
    const user = {
      id: "recruiter-1",
      portal: "recruiter",
      fullName: "Recruiter",
      email: "recruiter@example.test",
      emailVerified: true,
      avatarUrl: null,
      status: "active",
    } as const;
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, user, csrfToken: "csrf.next" },
    } as never);

    render(
      <Provider store={store}>
        <BootstrapProbe portal="recruiter" />
      </Provider>,
    );

    await waitFor(() =>
      expect(portalIsBootstrapped(store.getState().auth, "recruiter")).toBe(true),
    );
    expect(userForPortal(store.getState().auth, "recruiter")).toEqual(user);
    expect(get).toHaveBeenCalledTimes(1);
  });

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
    // Rehydration restores cached users but deliberately excludes bootstrap
    // flags, so the server still verifies the httpOnly cookie on each reload.
    store.dispatch(setPortalBootstrapped({ portal: "seeker", value: false }));
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

  it("safely handles unmigrated auth state missing bootstrappedPortals and sessions", () => {
    // Simulate a legacy rehydrated state where neither `bootstrappedPortals` nor `sessions` exist
    const legacyAuth = {
      loading: false,
      user: null,
      bootstrapped: false,
    } as unknown as AuthState;

    expect(portalIsBootstrapped(legacyAuth, "seeker")).toBe(false);
    expect(userForPortal(legacyAuth, "seeker")).toBe(null);
  });

  it("renders BootstrapProbe without throwing when state lacks bootstrappedPortals", () => {
    const store = makeStore();
    // Recreate a store with a legacy unmigrated state structure
    const legacyStore = configureStore({
      reducer: {
        auth: (state = { loading: false, user: null, bootstrapped: false } as unknown as AuthState) => state,
        job: store.getState().job ? () => store.getState().job : () => ({}) as never,
      },
    });

    expect(() =>
      render(
        <Provider store={legacyStore}>
          <BootstrapProbe />
        </Provider>,
      ),
    ).not.toThrow();
  });
});
