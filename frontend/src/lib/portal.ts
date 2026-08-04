import type { Portal } from "@jobportal/shared";

const KEY = "jp.portal";

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
  return raw === "seeker" || raw === "recruiter" ? raw : null;
}

export function setPortalHint(portal: Portal): void {
  localStorage.setItem(KEY, portal);
}

export function clearPortalHint(): void {
  localStorage.removeItem(KEY);
}
