import { Compass } from "lucide-react";
import { Link } from "react-router";

import Navbar from "./shared/Navbar";
import { EmptyState } from "./layout/EmptyState";
import { PageHeader } from "./layout/PageHeader";
import PageShell from "./layout/PageShell";
import { Button } from "./ui/button";

/**
 * The catch-all page, mounted at `*`.
 *
 * It exists because of the SPA fallback rather than in spite of it: the host
 * rewrites every unresolved path to index.html with a 200, so a mistyped URL
 * reaches the client instead of the host's own 404 page. With no route to catch
 * it the router matches nothing and renders nothing — a blank white page.
 *
 * No portal prop, deliberately. `*` matches under every prefix and PortalScope
 * already resolves the signal colour from the path, so /hire/typo renders in
 * recruiter signal without this page knowing which portal it sits on.
 */
const NotFound = () => (
  <>
    {/* Outside PageShell like every other seeker page: the navbar is full-bleed
        and the shell's inner container would clamp it to the content column. */}
    <Navbar />
    <PageShell width="narrow">
      <PageHeader
        title="Page not found"
        description="That URL does not match any page here. The link may be incomplete, or the page may have been renamed."
      />
      <EmptyState
        icon={Compass}
        title="Pick up from somewhere real"
        description="Every open role lives on the job board, and each search there is a link you can share."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="signal">
              <Link to="/jobs">Browse open roles</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        }
      />
    </PageShell>
  </>
);

export default NotFound;
