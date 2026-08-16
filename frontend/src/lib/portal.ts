import type { Portal } from "@jobportal/shared";

const KEY = "jp.portal";
let activePortal: Portal | null = null;

/**
 * Which portal this browser last signed into.
 *
 * A *hint*, never a credential. It decides which URL to send `/refresh` and
 * `/me` to; it grants nothing. Tampering with it can only produce a 401,
 * because authority lives in the httpOnly cookie whose key is derived per
 * portal — a seeker token presented at the recruiter mount fails the
 * signature check.
 *
 * It exists because the access cookie is `httpOnly`: JavaScript genuinely
 * cannot see which session it holds, and the alternative — trying both mounts
 * on every refresh — doubles the requests and makes the reuse-detector's job
 * ambiguous.
 */
export function getPortalHint(): Portal | null {
  const raw = localStorage.getItem(KEY);
  return raw === "seeker" || raw === "recruiter" || raw === "admin" ? raw : null;
}

/**
 * The portal this tab is actively using.
 *
 * localStorage remains the reload/new-tab bootstrap hint, but it is shared by
 * every tab. Once a tab has resolved its session, refreshes must stay pinned to
 * that portal even if another tab signs into a different one.
 */
export function getActivePortal(): Portal | null {
  return activePortal ?? getPortalHint();
}

/** Pins API retries to the portal represented by this tab's current route. */
export function activatePortal(portal: Portal): void {
  activePortal = portal;
}

export function setPortalHint(portal: Portal): void {
  activePortal = portal;
  localStorage.setItem(KEY, portal);
}

export function clearPortalHint(portal?: Portal): void {
  if (!portal || activePortal === portal) activePortal = null;
  if (!portal || getPortalHint() === portal) localStorage.removeItem(KEY);
}
