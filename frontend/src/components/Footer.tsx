import { Link } from "react-router";

import { Wordmark } from "@/components/shared/Wordmark";
import { FOOTER_COLUMNS } from "@/components/shared/siteNav";
import { SocialLinks } from "@/components/shared/SocialLinks";

/**
 * Site chrome. Mounted by `PublicLayout`, never by a page.
 *
 * It used to be imported by exactly one component — `Home` — while the navbar
 * was hand-mounted in nine, so every link the footer carried was reachable from
 * the landing page and nowhere else. A privacy policy linked from one route is
 * not linked.
 *
 * Social links are rendered only when they resolve to an explicit Cairn or
 * owner profile. Bare platform homepages are intentionally excluded because
 * they do not establish a destination visitors can recognise or trust.
 */
const Footer = () => {
  return (
    <footer className="site-chrome-footer border-t border-media-copy/10 bg-media-shade text-media-copy">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.55fr_repeat(4,minmax(0,1fr))]">
          <div className="lg:pr-10">
            {/* The lockup, not a hand-written copy of it. An h2 rather than an
                h1: the footer is a landmark, not the page's subject. */}
            <h2 className="text-xl">
              <Wordmark tone="media" />
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-media-copy/65">
              A deliberate route from looking to hired, built for people choosing their next move and teams choosing who joins them.
            </p>
            <SocialLinks className="mt-7 [&_a]:border-media-copy/20 [&_a]:text-media-copy/65 [&_a:hover]:border-signal [&_a:hover]:bg-media-copy/10 [&_a:hover]:text-media-copy" />
          </div>

          {FOOTER_COLUMNS.map((column, index) => {
            const headingId = `footer-column-${index}`;

            return (
              <nav key={column.heading} aria-labelledby={headingId}>
                <h3 id={headingId} className="text-sm font-semibold text-media-copy">
                  {column.heading}
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="text-sm text-media-copy/60 transition-colors duration-(--dur-fast) hover:text-media-copy focus-visible:text-media-copy"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-media-copy/15 pt-6 text-xs text-media-copy/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {new Date().getFullYear()} Cairn.</p>
          <p>Built for people who are looking, and people who are hiring.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
