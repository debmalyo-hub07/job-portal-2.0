import { Outlet } from "react-router";

import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/Footer";

/**
 * The chrome every public surface shares.
 *
 * Before this existed, `Navbar` was imported by nine components and `Footer` by
 * one, each mounting its own copy — the same duplication that let the navbar keep
 * rendering an `<h1>` for a year after `AuthLayout` had settled on a `<span>`.
 * Chrome that every page needs is the layout's job, not each page's.
 *
 * The flex column exists for pages that render *less* than a full viewport
 * without going through `PageShell` — the outlet wrapper takes `flex-1` so the
 * footer sits at the bottom of the window rather than floating mid-screen.
 * `PageShell`'s own `min-h-screen` already covers the pages that use it; there
 * the footer follows a viewport-tall surface, which is ordinary.
 *
 * Deliberately not used by the workspace, the console, or auth. Those are
 * signed-in working surfaces with their own shells and their own sub-navigation,
 * and a marketing footer under an applicant table is noise. They reach the legal
 * pages the same way anyone does — the URLs are public. The one signed-in
 * exception is the three portals' account pages: an account page is not a
 * working surface, and each one renders here so no portal's section nav ever
 * sits on it — the nav's links have nothing to do with the page and never
 * list it.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
