import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";

import { makeStore } from "./helpers/renderRoute";
import { setUser } from "@/redux/authSlice";
import Navbar from "@/components/shared/Navbar";

function storeWithUser(portal: "seeker" | "recruiter") {
  const s = makeStore();
  s.dispatch(
    setUser({
      id: "u1",
      fullName: "Arjun Mehta",
      email: "arjun@example.test",
      portal,
      avatarUrl: null,
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

  it("shows no auth links when signed in", () => {
    const { queryByRole } = renderNavbar(storeWithUser("seeker"));
    expect(queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
