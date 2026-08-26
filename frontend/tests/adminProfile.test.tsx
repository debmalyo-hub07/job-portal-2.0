import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminProfile from "@/components/console/AdminProfile";
import { apiClient } from "@/lib/apiClient";
import { setUser } from "@/redux/authSlice";
import { makeStore, renderAppAt, renderRoute } from "./helpers/renderRoute";

const render = () => renderRoute(<AdminProfile />, { route: "/admin/profile" });

describe("admin profile", () => {
  it("renders inside the console shell", () => {
    render();
    expect(screen.getByText(/platform console/i)).toBeTruthy();
  });

  it("reads the admin mount, not the shared one", async () => {
    // `authenticateAny` excludes admin, so `/user/profile` answers 401 here.
    // ADR-0006 requires that stay true, which is why the console has its own
    // mount of the same two controller functions.
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ data: { profile: null } });
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
        profileComplete: true,
      }),
    );
    renderRoute(<AdminProfile />, { route: "/admin/profile", store });
    expect(get).toHaveBeenCalledWith("/admin/profile");
    expect(get).not.toHaveBeenCalledWith("/user/profile");
    get.mockRestore();
  });

  it("offers no designation field, which is a recruiter concept", () => {
    render();
    expect(screen.queryByLabelText(/^designation/i)).toBeNull();
  });

  it("carries the identity fields, unrequired", () => {
    // Admin is ungated, so this page is where an admin fills these in whenever
    // they choose rather than being made to.
    render();
    expect(screen.getByLabelText(/^date of birth/i)).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText(/^gender/i)).toBeTruthy();
    expect(screen.getByLabelText(/^phone/i)).toBeTruthy();
  });

  it("is mounted behind the admin portal gate", () => {
    const view = renderAppAt("/admin/profile");
    expect(view.pathname()).not.toBe("/admin/profile");
  });
});
