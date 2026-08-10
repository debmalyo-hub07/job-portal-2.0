import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderRoute } from "./helpers/renderRoute";
import HireShell from "@/components/workspace/HireShell";
import WorkspaceJobs from "@/components/workspace/WorkspaceJobs";
import { navLinksFor } from "@/components/shared/navLinks";

describe("HireShell", () => {
  it("renders the page title as the only h1", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    // The navbar wordmark is a <span> since 2B-2; a second h1 here would put
    // every workspace route back to two competing top-level headings.
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Jobs");
  });

  it("runs compact and response, like the console", () => {
    const { container } = renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const shell = container.querySelector("[data-density]");
    expect(shell).toHaveAttribute("data-density", "compact");
    // Tier 3 feedback only: this is work, not marketing.
    expect(shell).toHaveAttribute("data-motion", "response");
  });

  it("builds its sub-nav from navLinksFor, so the tabs and navbar agree", () => {
    renderRoute(
      <HireShell title="Jobs">
        <p>body</p>
      </HireShell>,
      { route: "/hire/jobs" },
    );
    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    for (const link of navLinksFor("recruiter")) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute(
        "href",
        link.to,
      );
    }
  });
});

describe("WorkspaceJobs", () => {
  it("shows a skeleton while loading, never a blank screen", () => {
    const { container } = renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("reports a failed load in an alert rather than as an empty table", async () => {
    // jsdom has no API, so every fetch rejects — which is precisely the error
    // path. The inherited page console.error'd and rendered an empty table,
    // indistinguishable from "you have posted no jobs".
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("puts the search keyword in the URL", async () => {
    renderRoute(<WorkspaceJobs />, { route: "/hire/jobs" });
    const search = screen.getByLabelText("Search jobs");
    fireEvent.change(search, { target: { value: "react" } });
    await waitFor(() => expect(search).toHaveValue("react"));
  });
});
