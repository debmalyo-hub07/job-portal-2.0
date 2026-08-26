import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import { setUser } from "@/redux/authSlice";
import Navbar from "@/components/shared/Navbar";
import { navLinksFor } from "@/components/shared/navLinks";

function storeWithUser(portal: "seeker" | "recruiter" | "admin") {
  const s = makeStore();
  s.dispatch(
    setUser({
      id: "u1",
      fullName: "Arjun Mehta",
      email: "arjun@example.test",
      portal,
      avatarUrl: null,
      profileComplete: true,
    } as never),
  );
  return s;
}

function renderNavbar(store: ReturnType<typeof makeStore>, route = "/") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Navbar />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Navbar account menu", () => {
  it("renders a visible avatar trigger when avatarUrl is null", () => {
    // Regression, bug 3. AvatarImage with a null src renders nothing and there
    // was no AvatarFallback sibling, so the trigger collapsed to an empty circle
    // and sign-out became unreachable on both portals. avatarUrl is null for
    // every account created through the standard flow.
    const { getByText } = renderNavbar(storeWithUser("seeker"));
    expect(getByText("AM")).toBeInTheDocument();
  });

  it("renders the fallback for a recruiter too", () => {
    const { getByText } = renderNavbar(storeWithUser("recruiter"), "/hire/companies");
    expect(getByText("AM")).toBeInTheDocument();
  });

  it("shows auth links when signed out", () => {
    const { getByRole } = renderNavbar(makeStore());
    expect(getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("keeps the anonymous employer wordmark inside the hiring portal", () => {
    const { getByRole } = renderNavbar(makeStore(), "/hire");
    expect(getByRole("link", { name: /cairn/i })).toHaveAttribute("href", "/hire");
  });

  it.each([
    ["seeker", "/", "/"],
    ["recruiter", "/hire/companies", "/hire/companies"],
  ] as const)("links the signed-in %s wordmark to its portal home", (portal, route, home) => {
    const { getByRole } = renderNavbar(storeWithUser(portal), route);
    expect(getByRole("link", { name: /cairn/i })).toHaveAttribute("href", home);
  });

  it("includes a Home link for a signed-in seeker", () => {
    const { getAllByRole } = renderNavbar(storeWithUser("seeker"));
    expect(getAllByRole("link", { name: "Home" }).some((link) => link.getAttribute("href") === "/")).toBe(true);
  });

  it("uses workspace links for a signed-in recruiter", () => {
    const { getByRole, queryByRole } = renderNavbar(
      storeWithUser("recruiter"),
      "/hire/companies",
    );
    expect(getByRole("link", { name: "Companies" })).toHaveAttribute("href", "/hire/companies");
    expect(queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  /**
   * A public bar may only offer public destinations.
   *
   * `/hire` spent a phase redirecting signed-out visitors to `/hire/login`, so
   * the recruiter *public* bar was never rendered and kept the workspace pair it
   * had been copied from. The moment the landing page was reachable again, an
   * anonymous visitor was handed "Companies" and "Jobs" — two gated routes whose
   * only effect was to bounce them back to the sign-in form they had just left.
   *
   * Admin is excluded because it has no public bar: no console page is mounted
   * under `PublicLayout`, so the navbar never renders for a signed-out admin.
   */
  it.each(["seeker", "recruiter"] as const)(
    "offers a signed-out %s no link into a gated route",
    (portal) => {
      const gated = [/^\/profile/, /^\/hire\/(companies|jobs)/, /^\/admin\//];

      for (const link of navLinksFor(portal, "public")) {
        for (const pattern of gated) expect(link.to).not.toMatch(pattern);
      }
    },
  );

  it("renders the employer landing bar without the workspace pair", () => {
    const { queryByRole, getByRole } = renderNavbar(makeStore(), "/hire");

    expect(queryByRole("link", { name: "Companies" })).not.toBeInTheDocument();
    expect(getByRole("link", { name: /for candidates/i })).toHaveAttribute("href", "/");
  });

  it("shows no auth links when signed in", () => {
    const { queryByRole } = renderNavbar(storeWithUser("seeker"));
    expect(queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });
});

describe("the profile entry point", () => {
  // Gating this on `portal === "seeker"` is what left a recruiter and an admin
  // with no route to their own account at all. Still not in `navLinksFor`: the
  // popover is present at every breakpoint, so a primary link would duplicate the
  // only path and spend a slot in a five-item bar.
  //
  // One test per portal: Radix renders PopoverContent into a portal on
  // `document.body`, which RTL only clears between tests, so a second render in
  // the same test would leave two menus and every lookup ambiguous.
  // Each rendered on a route its own portal owns: the navbar resolves the portal
  // from the route, so a recruiter session on `/` is not a signed-in session and
  // no account menu renders at all.
  it.each([
    ["seeker", "/", "/profile"],
    ["recruiter", "/hire/companies", "/hire/profile"],
    ["admin", "/admin/dashboard", "/admin/profile"],
  ] as const)("offers View profile to a %s session", async (portal, route, href) => {
    const view = renderNavbar(storeWithUser(portal), route);
    await userEvent.click(view.getByRole("button", { name: /account/i }));
    const link = await screen.findByRole("link", { name: /view profile/i });
    expect(link.getAttribute("href")).toBe(href);
  });
});
