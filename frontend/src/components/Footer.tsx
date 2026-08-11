import { Link } from "react-router";

import { Wordmark } from "@/components/shared/Wordmark";
import { FOOTER_COLUMNS } from "@/components/shared/siteNav";

/**
 * Site chrome. Mounted by `PublicLayout`, never by a page.
 *
 * It used to be imported by exactly one component — `Home` — while the navbar
 * was hand-mounted in nine, so every link the footer carried was reachable from
 * the landing page and nowhere else. A privacy policy linked from one route is
 * not linked.
 *
 * The three social icons it used to carry are gone. They pointed at
 * facebook.com, twitter.com and linkedin.com — the platforms' own homepages,
 * not Cairn accounts — so clicking one navigated away from the product and
 * taught the visitor nothing. Under the no-dead-controls rule that is a dead
 * control wearing social proof; they come back with real accounts to link.
 */
const Footer = () => {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-7xl px-6 py-(--space-section)">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            {/* The lockup, not a hand-written copy of it. An h2 rather than an
                h1: the footer is a landmark, not the page's subject. */}
            <h2 className="text-xl">
              <Wordmark />
            </h2>
            <p className="mt-3 max-w-xs text-sm text-ink-muted">
              A cairn is a stack of stones one traveller leaves to mark the path for the next.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.heading} aria-labelledby={`footer-${column.heading}`}>
              <h3
                id={`footer-${column.heading}`}
                className="text-sm font-semibold tracking-wide text-ink"
              >
                {column.heading}
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-ink-muted transition-colors duration-(--dur-fast) hover:text-signal-text"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-(--space-section) flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          {/* Derived, not hardcoded. The inherited footer claimed
              "© 2024 Your Company" in a shipped build. */}
          <p>© {new Date().getFullYear()} Cairn. All rights reserved.</p>
          <p>Built for people who are looking, and people who are hiring.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
