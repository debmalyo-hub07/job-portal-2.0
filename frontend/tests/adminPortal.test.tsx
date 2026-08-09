import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { AccountStatus } from "@jobportal/shared";

import { makeStore, renderAppAt } from "./helpers/renderRoute";
import { appRoutes } from "@/routes/appRoutes";
import { setBootstrapped, setUser } from "@/redux/authSlice";

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
   * The wordmark links to /admin, so that path must resolve rather than 404.
   *
   * Signed out, that is the sign-in — the only destination before the console
   * existed. The store is bootstrapped first because `AdminHomeRedirect` waits
   * for `/me` before choosing: rendering nothing while the session is unknown
   * is what stops a signed-in admin seeing a login form flash. In the app,
   * `useAuthBootstrap` sets that flag; a test has to set it itself.
   */
  it("gives /admin a front door", async () => {
    const store = makeStore();
    store.dispatch(setBootstrapped(true));

    const view = renderAppAt("/admin", { store });
    await waitFor(() => expect(view.pathname()).toBe("/admin/login"));
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
});

describe("approved recruiter", () => {
  it("reaches the workspace", async () => {
    renderAppAt("/hire/companies", { store: storeWithRecruiter("active") });
    expect(await screen.findByRole("button", { name: /new company/i })).toBeInTheDocument();
    expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument();
  });
});
