import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { AccountStatus } from "@jobportal/shared";

import { apiClient } from "@/lib/apiClient";
import { makeStore, renderAppAt } from "./helpers/renderRoute";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";

afterEach(() => vi.restoreAllMocks());

const paths = appRoutes.flatMap((r) => (r.children ?? []).map((c) => c.path)).filter(Boolean);

function storeWithRecruiter(status: AccountStatus) {
  const store = makeStore();
  store.dispatch(
    setUser({
      id: "r1",
      portal: "recruiter",
      fullName: "Rec",
      email: "r@example.com",
      emailVerified: true,
      avatarUrl: null,
      status,
    }),
  );
  store.dispatch(setBootstrapped(true));
  return store;
}

/**
 * The invited admin's landing screen.
 *
 * An admin created by another admin has `passwordHash: null` and receives a
 * `reset_password` code by email. Before Phase 1 the email named a "password
 * setup screen" that did not exist, so the only way to redeem the code was to
 * know to type /reset-password?portal=admin by hand. These tests pin the screen
 * the email now links to, and the first-run copy that separates it from a reset.
 */
describe("admin password setup", () => {
  it("mounts a setup screen at /admin/set-password", async () => {
    renderAppAt("/admin/set-password");
    expect(await screen.findByLabelText(/^code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  /**
   * The portal comes from the route literal, not from `?portal=`. /admin/login
   * needs no query parameter to resolve admin and neither should this — the
   * link in the email carries only the address.
   */
  it("resolves the admin portal without a ?portal= parameter", async () => {
    const { container } = renderAppAt("/admin/set-password");
    await screen.findByLabelText(/^code/i);
    expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe("admin");
  });

  it("prefills the address the invite link carries", async () => {
    renderAppAt("/admin/set-password?email=new%40example.com");
    await screen.findByLabelText(/^code/i);
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
  });

  /**
   * Someone who has never had a password is not "choosing a new" one and cannot
   * have "remembered it". Reset copy on this screen reads as though the invited
   * admin has an account they have forgotten the password to.
   */
  it("uses first-run copy rather than reset copy", async () => {
    renderAppAt("/admin/set-password");
    await screen.findByLabelText(/^code/i);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/set your password/i);
    expect(screen.queryByText(/remembered it/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set password/i })).toBeInTheDocument();
  });

  /**
   * "New password" and "not one you have used before" both presuppose an old
   * one. `passwordHash` is null on an invited admin, so there is nothing for a
   * reuse check to compare against and nothing for "new" to contrast with.
   */
  it("does not describe the password as new", async () => {
    renderAppAt("/admin/set-password");
    await screen.findByLabelText(/^code/i);
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used before/i)).not.toBeInTheDocument();
  });

  /** The one recovery path that does make sense here: the code expired. */
  it("keeps a way to request a fresh code", async () => {
    renderAppAt("/admin/set-password?email=new%40example.com");
    await screen.findByLabelText(/^code/i);
    expect(screen.getByRole("link", { name: /request a new one/i })).toHaveAttribute(
      "href",
      "/forgot-password?portal=admin&email=new%40example.com",
    );
  });
});

describe("admin portal sign-in", () => {
  it("mounts a sign-in at /admin/login", async () => {
    renderAppAt("/admin/login");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("resolves the admin portal on /admin/login", async () => {
    const { container } = renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(container.querySelector("[data-portal]")?.getAttribute("data-portal")).toBe("admin");
  });

  /**
   * The API's admin router mounts no /register, so a signup link here would be a
   * dead end. Admins are seeded, then created by an existing admin.
   */
  it("offers no signup link", async () => {
    renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(screen.queryByText(/create one/i)).not.toBeInTheDocument();
  });

  /**
   * The API mounts no Google routes on admin, so a button offering it could only
   * ever 404. It was rendered unconditionally until this test existed.
   */
  it("offers no Google sign-in button", async () => {
    renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(
      screen.queryByRole("button", { name: /continue with google/i }),
    ).not.toBeInTheDocument();
  });

  it("mounts no /admin/signup route at all", () => {
    expect(paths).not.toContain("/admin/signup");
  });

  /**
   * An internal console door has no public counterpart to advertise, so the
   * cross-link the other two portals carry must not render.
   */
  it("offers no cross-link to another portal", async () => {
    renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(screen.queryByText(/looking for a job/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hiring instead/i)).not.toBeInTheDocument();
  });

  /**
   * `/admin` is typed and bookmarked, and it owns the console prefix, so it must
   * resolve rather than 404.
   *
   * Signed out, that is the sign-in — the only destination before the console
   * existed. The store is bootstrapped first because `AdminHomeRedirect` waits
   * for `/me` before choosing: rendering nothing while the session is unknown
   * is what stops a signed-in admin seeing a login form flash. In the app,
   * `useAuthBootstrap` sets that flag; a test has to set it itself.
   *
   * No auth screen links here any more — because this resolves to the sign-in
   * for a signed-out visitor, the Back link and wordmark that pointed at it were
   * no-ops. See the two tests below.
   */
  it("gives /admin a front door", async () => {
    const store = makeStore();
    store.dispatch(setBootstrapped(true));

    const view = renderAppAt("/admin", { store });
    await waitFor(() => expect(view.pathname()).toBe("/admin/login"));
  });

  /**
   * The console door carries no control that leads back to itself.
   *
   * `AuthLayout` aims both the wordmark and Back at the portal's own home, and
   * admin's home is this page — so both silently returned you here. The
   * recruiter portal had the same defect and got its landing page back; admin
   * has no marketing page to restore, so the controls are simply not rendered.
   */
  it("offers no Back link on the console door", async () => {
    renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(screen.queryByRole("link", { name: /back/i })).not.toBeInTheDocument();
  });

  it("renders the console wordmark as text rather than a self-link", async () => {
    renderAppAt("/admin/login");
    await screen.findByLabelText(/email/i);
    expect(screen.getByText("Cairn")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /cairn/i })).not.toBeInTheDocument();
  });

  /**
   * Signed in as an admin, /admin resolves to the console rather than a login
   * form the admin has already passed — the whole point of reading the
   * session here instead of always sending to /login.
   */
  it("sends a signed-in admin from /admin straight to the dashboard", async () => {
    const store = makeStore();
    store.dispatch(
      setUser({
        id: "a1",
        portal: "admin",
        fullName: "Root",
        email: "root@example.com",
        emailVerified: true,
        avatarUrl: null,
        status: "active",
      }),
    );
    store.dispatch(setBootstrapped(true));

    const view = renderAppAt("/admin", { store });
    await waitFor(() => expect(view.pathname()).toBe("/admin/dashboard"));
  });
});

describe("pending recruiter", () => {
  it("sees the awaiting-approval state instead of the workspace", async () => {
    renderAppAt("/hire/companies", { store: storeWithRecruiter("pending") });
    expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new company/i })).not.toBeInTheDocument();
  });

  /**
   * The gate covers the whole workspace, not just its entry page. The API
   * answers 403 RECRUITER_PENDING_APPROVAL on every recruiter-owned mutation,
   * so a reachable post-job form would be a form that cannot submit.
   */
  it.each(["/hire/companies/create", "/hire/jobs", "/hire/jobs/create"])(
    "is gated on %s too",
    async (path) => {
      renderAppAt(path, { store: storeWithRecruiter("pending") });
      expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
    },
  );

  it("keeps a way out — the account menu still renders", async () => {
    renderAppAt("/hire/companies", { store: storeWithRecruiter("pending") });
    await screen.findByText(/awaiting approval/i);
    expect(screen.getByRole("button", { name: /account menu/i })).toBeInTheDocument();
  });

  /**
   * The gate reads `status` from Redux, which `useAuthBootstrap` fills once at
   * startup. Approval happens on the server, in another session entirely, so
   * without a poll of its own this screen never changes — a recruiter approved
   * while looking at it waits on a promise the page cannot keep, and the only
   * way through is a hard reload nothing tells them to perform.
   */
  it("clears itself when the server reports the account is now active", async () => {
    const store = storeWithRecruiter("pending");
    const get = vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
      if (url === "/recruiter/auth/me") {
        return {
          data: {
            success: true,
            user: { ...store.getState().auth.user!, status: "active" satisfies AccountStatus },
          },
        } as never;
      }
      return { data: { success: true, items: [], page: 1, pages: 1, total: 0 } } as never;
    });

    renderAppAt("/hire/companies", { store });
    await screen.findByText(/awaiting approval/i);

    await waitFor(() => expect(store.getState().auth.user?.status).toBe("active"));
    await waitFor(() =>
      expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument(),
    );
    expect(get.mock.calls.map(([url]) => url)).toContain("/recruiter/auth/me");
  });

  /**
   * The poll exists for one state. An approved recruiter's status cannot change
   * back, so leaving it running would be a request every minute per open tab for
   * an answer that is already settled.
   */
  it("does not poll once the account is active", async () => {
    const store = storeWithRecruiter("active");
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, items: [], page: 1, pages: 1, total: 0 },
    } as never);

    renderAppAt("/hire/companies", { store });
    await screen.findByRole("button", { name: /new company/i });

    expect(get.mock.calls.map(([url]) => url)).not.toContain("/recruiter/auth/me");
  });
});

describe("approved recruiter", () => {
  it("reaches the workspace", async () => {
    renderAppAt("/hire/companies", { store: storeWithRecruiter("active") });
    expect(await screen.findByRole("button", { name: /new company/i })).toBeInTheDocument();
    expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument();
  });
});
