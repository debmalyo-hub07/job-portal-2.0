import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { Portal } from "@jobportal/shared";

import { renderRoute } from "./helpers/renderRoute";
import { Wordmark } from "@/components/shared/Wordmark";

/**
 * The platform's name and mark.
 *
 * There were two hand-written copies of the wordmark — the navbar's and
 * AuthLayout's — which is how the navbar kept rendering an `<h1>` for a year
 * after the auth layout had settled on a `<span>`. These assert the properties
 * that made the split expensive, so a third copy has to break something.
 */
describe("Wordmark", () => {
  it("is never a heading", () => {
    const { container } = renderRoute(<Wordmark to="/" />, { route: "/" });
    // A site identifier is not the heading of the page it sits on. As an h1 it
    // gave every route two competing top-level headings, so a screen-reader
    // user navigating by heading hit the site name before the page's title.
    expect(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0);
  });

  it("names the surface, not the brand, per portal", () => {
    const cases: [Portal, string][] = [
      ["seeker", "Cairn"],
      ["recruiter", "Cairn / Hire"],
      ["admin", "Cairn / Console"],
    ];
    for (const [portal, expected] of cases) {
      const { unmount } = renderRoute(<Wordmark portal={portal} />, { route: "/" });
      // Normalised: the separator is its own aria-hidden span with margins, so
      // textContent has no spaces around the slash.
      expect(screen.getByText(/Cairn/).textContent?.replace(/\s+/g, " ").trim()).toBe(
        expected.replace(" / ", "/"),
      );
      unmount();
    }
  });

  it("renders the mark decoratively, so it is not announced twice", () => {
    const { container } = renderRoute(<Wordmark />, { route: "/" });
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("links only when given a destination", () => {
    const { container, unmount } = renderRoute(<Wordmark />, { route: "/" });
    expect(container.querySelector("a")).toBeNull();
    unmount();

    renderRoute(<Wordmark to="/hire" />, { route: "/" });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/hire");
  });
});
