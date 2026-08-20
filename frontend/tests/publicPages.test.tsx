import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderAppAt } from "./helpers/renderRoute";

/**
 * The public informational surfaces, and the chrome that makes them reachable.
 *
 * The defect this suite exists to prevent: before 2B-4 the footer was mounted in
 * exactly one component (`Home.tsx`) while the navbar was hand-mounted in nine.
 * So every link a footer carries — legal, contact, about — was reachable from
 * the seeker landing page and from nowhere else. A privacy policy linked from
 * one route is not linked.
 */

/**
 * Every public path that must resolve to a real page, not the catch-all.
 *
 * The heading pattern is per-page rather than derived from the path: a good
 * marketing headline is not its own route name, and asserting that /about says
 * "About" would be a test demanding worse copy. About's h1 is a sentence; the
 * legal and utility pages say what they are because that is what those pages
 * are for.
 */
const PUBLIC_PAGES = [
  { path: "/about", heading: /mark the way/i },
  { path: "/contact", heading: /contact/i },
  { path: "/privacy", heading: /privacy/i },
  { path: "/terms", heading: /terms/i },
  { path: "/help", heading: /help|frequently asked/i },
  { path: "/updates", heading: /product, in motion/i },
];

describe("public informational routes", () => {
  it.each(PUBLIC_PAGES)("$path renders its own page, not NotFound", async ({ path, heading }) => {
    renderAppAt(path);

    // NotFound is what an unmounted path resolves to now that the SPA rewrite
    // answers every URL with index.html — so "did not 404" has to be asserted
    // as "did not render the not-found copy", not as a status code.
    expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();

    const h1s = await screen.findAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName(heading);
  });
});

/**
 * The employer marketing page.
 *
 * Not in PUBLIC_PAGES because it is a pitch rather than an informational
 * surface, but it needs the same orphan guard: the page existed, complete, while
 * `/hire` rendered a redirect to the sign-in form instead — so the footer's
 * "Hire on Cairn", the navbar's "For employers", and the wordmark on every
 * recruiter auth screen all pointed at a login form, and the page itself was
 * mounted nowhere.
 */
describe("employer landing page", () => {
  it("/hire renders its own page, not a sign-in redirect", async () => {
    const view = renderAppAt("/hire");

    expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();
    expect(view.pathname()).toBe("/hire");

    const h1s = await screen.findAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName(/build the team, without the hiring theatre/i);
  });

  it("is reachable from the footer that every public page carries", async () => {
    renderAppAt("/");

    const footer = await screen.findByRole("contentinfo");
    expect(footer.querySelector('a[href="/hire"]')).not.toBeNull();
  });
});

describe("footer reach", () => {
  /**
   * The footer is chrome, so it belongs to the layout rather than to a page.
   * Asserting it on a route that is not the landing page is the whole point:
   * `/jobs` never mounted it before 2B-4.
   */
  it.each(["/", "/jobs", "/about", "/privacy"])("renders on %s", async (path) => {
    renderAppAt(path);

    const footer = await screen.findByRole("contentinfo");
    expect(footer).toBeInTheDocument();
  });

  it("links every informational page from the footer", async () => {
    renderAppAt("/");

    const footer = await screen.findByRole("contentinfo");
    for (const { path } of PUBLIC_PAGES) {
      expect(footer.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
  });

  it("does not advertise a private profile to signed-out visitors", async () => {
    renderAppAt("/");

    const footer = await screen.findByRole("contentinfo");
    expect(footer.querySelector('a[href="/profile"]')).toBeNull();
  });

  /**
   * The inherited footer linked facebook.com, twitter.com and linkedin.com —
   * the platforms' own homepages, not Cairn accounts. Under the project's
   * no-dead-controls rule those are dead controls dressed as social proof: a
   * visitor clicking "Facebook" lands on Facebook, having learnt nothing about
   * Cairn. They are removed rather than pointed somewhere plausible.
   */
  it("carries no link to a bare social platform homepage", async () => {
    renderAppAt("/");

    const footer = await screen.findByRole("contentinfo");
    const hrefs = [...footer.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");

    for (const href of hrefs) {
      expect(href).not.toMatch(
        /^https?:\/\/(www\.)?(facebook|twitter|x|linkedin|instagram)\.com\/?$/,
      );
    }
  });

  /**
   * Any external link that does survive opens in a new tab, and a target=_blank
   * without rel=noopener hands the opened page a window.opener reference back
   * into the app.
   */
  it("gives every external link rel=noopener noreferrer", async () => {
    renderAppAt("/");

    const footer = await screen.findByRole("contentinfo");
    const external = [...footer.querySelectorAll("a")].filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("http"),
    );

    for (const link of external) {
      expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
      expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
    }
  });
});

describe("legal pages are honestly marked", () => {
  /**
   * Cairn is pre-launch, so the legal pages ship with the correct structure and
   * an unmissable marker where a lawyer must supply the operating entity,
   * jurisdiction and processor list. Fabricated legal text presented as final is
   * worse than an obvious placeholder: it reads as a commitment nobody made.
   */
  it.each(["/privacy", "/terms"])("%s says it is not yet legal advice", async (path) => {
    renderAppAt(path);

    expect(await screen.findByRole("alert")).toHaveTextContent(/review|counsel|not yet|draft/i);
  });
});
