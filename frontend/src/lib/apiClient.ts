import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { Portal } from "@jobportal/shared";
import { getActivePortal } from "./portal";

/**
 * The CSRF token, held in memory.
 *
 * Every session-issuing response (`/login`, `/verify-email`, `/refresh`, `/me`)
 * returns it in the body, and the client keeps it here rather than reading the
 * cookie back.
 *
 * The response body is authoritative under either deployment topology below. It
 * keeps session bootstrapping independent of browser cookie visibility, which
 * cross-site is not merely a nicety: Chrome stores this cookie and sends it on
 * requests while withholding it from `document.cookie` entirely. Measured
 * against production — three cookies stored, `document.cookie` empty. Every
 * mutation then goes out with no `X-CSRF-Token` and 403s, which surfaces as the
 * session dropping itself about 15 minutes in: reads are fine until the access
 * token expires, then `/refresh` (a POST) 403s and cannot recover.
 *
 * In memory is also strictly stronger than the cookie. A non-httpOnly cookie is
 * readable by every script on the page; a module variable is readable by none.
 *
 * It is null before sign-in and after a reload — `useAuthBootstrap` re-arms it
 * from `/me`, which is why that endpoint returns one.
 */
const csrfTokens: Partial<Record<Portal, string>> = {};

export function setCsrfToken(portal: Portal, token: string | null): void {
  if (token) csrfTokens[portal] = token;
  else delete csrfTokens[portal];
}

/**
 * Same-origin fallback, kept for local development where the API is proxied
 * onto the dev server's origin and the response body may not have been seen yet
 * (a mutation fired before bootstrap resolves). Cross-site this always returns
 * null, which is the bug above — it is a fallback, never the primary path.
 */
function readCsrfCookie(portal: Portal): string | null {
  for (const name of [`__Host-jp_${portal}_csrf`, `jp_${portal}_csrf`]) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

/**
 * A missing `VITE_API_URL` is not survivable, so fail loudly at import rather
 * than letting axios default `baseURL` to the page origin — that turns every
 * API call into a request against the Vite dev server, which answers `index.html`
 * with a 200. The app then renders as if it were online while nothing works, and
 * the network tab shows no errors to explain it.
 *
 * This has bitten twice. The second time the variable *was* set, but the file was
 * saved UTF-8-with-BOM, so the key Vite parsed carried a leading U+FEFF and this
 * one read `undefined`. Write `frontend/.env.local` as plain UTF-8; PowerShell's
 * `>` and `Set-Content` both emit a BOM by default. Prefer `-Encoding utf8NoBOM`.
 */
const baseURL = import.meta.env.VITE_API_URL;
if (!baseURL) {
  throw new Error(
    "VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env.local " +
      "and set it (e.g. http://localhost:8000/api/v1). If the file looks correct, " +
      "check it is saved as UTF-8 without a BOM.",
  );
}

/**
 * Single configured client. `withCredentials` is set once here rather than
 * repeated at every call site, where it is easy to forget — and forgetting it
 * silently drops the auth cookie.
 */
export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

/**
 * DEPLOYMENT NOTE — this base URL is one end of a five-part decision.
 *
 * `SameSite` compares *sites* (registrable domains), not origins, so where the
 * API lives decides how the session travels. Two configurations are coherent,
 * and every piece of each has to be in place at once:
 *
 *   cross-site   `VITE_API_URL` = the Render URL
 *                COOKIE_SAMESITE=none, CSP connect-src allows that origin,
 *                CLIENT_URLS allows the web origin, Google's redirect URIs
 *                point at the API host.
 *                Works on desktop. Mobile Safari blocks the third-party cookie
 *                and Chrome partitions it, so a reload or a tab switch arrives
 *                with no session — the reported "instant logout".
 *
 *   same-origin  `VITE_API_URL` = `/api/v1`
 *                API_PROXY_ORIGIN set on Vercel so proxy.js can forward,
 *                COOKIE_SAMESITE=strict, CSP connect-src 'self', API_BASE_URL
 *                the web origin, Google's redirect URIs re-registered there.
 *                The cookie is first-party, so mobile keeps it.
 *
 * Mixing them is worse than either. Shipping the CSP and the cookie setting of
 * the second while the built bundle still held the first blocked every request
 * in the browser, on every device — a total outage from two lines that both read
 * like hardening. `app.example.com` → `api.example.com` is a third coherent
 * option: same site, different origin, cookie sent under `strict`, no proxy —
 * but it needs a registrable domain both hosts serve, and `__Host-` has to
 * become `__Secure-` because a shared-domain cookie needs `Domain`.
 */
apiClient.interceptors.request.use((config) => {
  const request = config as PortalConfig;
  request._portal ??= portalForRequest(config.url) ?? getActivePortal() ?? undefined;
  const method = (config.method ?? "get").toLowerCase();
  if (method !== "get" && method !== "head" && request._portal) {
    const token = csrfTokens[request._portal] ?? readCsrfCookie(request._portal);
    if (token) config.headers.set("X-CSRF-Token", token);
  }
  return config;
});

/** Marks a request that has already been retried, so a retry cannot recurse. */
type PortalConfig = InternalAxiosRequestConfig & { _portal?: Portal; _retried?: boolean };

function portalForRequest(url: string | undefined): Portal | null {
  const auth = url?.match(/^\/(seeker|recruiter|admin)\/auth(?:\/|$)/)?.[1];
  if (auth === "seeker" || auth === "recruiter" || auth === "admin") return auth;
  if (url?.startsWith("/admin/")) return "admin";
  if (url?.startsWith("/company/")) return "recruiter";
  if (url?.startsWith("/job/post") || url?.startsWith("/job/getadminjobs")) return "recruiter";
  if (url?.startsWith("/application/apply/") || url?.startsWith("/application/get")) {
    return "seeker";
  }
  if (url?.startsWith("/application/status/") || url?.includes("/applicants")) {
    return "recruiter";
  }
  return null;
}

/**
 * The in-flight refresh, shared by every 401 that arrives while it is pending.
 *
 * This is the whole point. Six components mounting at once produce six 401s;
 * without this they produce six POST /refresh calls, five of which present a
 * token the first has already rotated. The reuse detector reads that as theft
 * and revokes the entire family — the user is logged out by their own page
 * load. One promise, awaited by all six.
 */
const refreshInFlight = new Map<Portal, Promise<void>>();

/** Session ended for real. `useAuthBootstrap` wires the store teardown here. */
let onSessionLost: (portal: Portal) => void = () => {};
export function setSessionLostHandler(handler: (portal: Portal) => void): void {
  onSessionLost = handler;
}

function refreshOnce(portal: Portal): Promise<void> {
  const existing = refreshInFlight.get(portal);
  if (existing) return existing;

  const request = apiClient
    .post<{ success: true; csrfToken?: string }>(`/${portal}/auth/refresh`)
    .then((res) => {
      // Rotation replaces the CSRF cookie too, so the token held in memory is
      // stale the moment this resolves. Not adopting the new one turns the
      // *next* mutation into a 403 — the same outage, one step further along,
      // and harder to see because the refresh itself succeeded.
      if (res.data?.csrfToken) setCsrfToken(portal, res.data.csrfToken);
      return undefined;
    })
    .finally(() => {
      // Cleared in `finally`, not `then`: leaving a rejected promise cached
      // means every later 401 re-rejects with a stale error and the user can
      // never recover without a hard reload.
      refreshInFlight.delete(portal);
    });
  refreshInFlight.set(portal, request);
  return request;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as PortalConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? "";

    // Not a 401, no config to replay, or already retried once: give up.
    if (status !== 401 || !config || config._retried) throw error;

    // Never refresh in response to an auth endpoint's own 401. `/refresh`
    // 401ing means the refresh token is dead; `/login` 401ing means wrong
    // password. Retrying either is at best pointless and at worst an infinite
    // loop between the interceptor and itself.
    if (url.includes("/auth/refresh") || url.includes("/auth/login")) {
      if (url.includes("/auth/refresh")) {
        const portal = config._portal ?? portalForRequest(url);
        if (portal) {
          onSessionLost(portal);
          setCsrfToken(portal, null);
        }
      }
      throw error;
    }

    const portal = config._portal ?? portalForRequest(url) ?? getActivePortal();
    if (!portal) throw error; // never signed in here; nothing to refresh

    config._retried = true;
    try {
      await refreshOnce(portal);
    } catch {
      onSessionLost(portal);
      throw error; // the ORIGINAL error — the refresh failure is an internal detail
    }
    return apiClient(config);
  },
);
