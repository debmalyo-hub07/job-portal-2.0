import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getPortalHint } from "./portal";

/**
 * Reads a non-httpOnly cookie. Only ever used for the CSRF token, which is
 * deliberately readable — that is the entire mechanism of double-submit.
 *
 * In production the cookie is `__Host-jp_csrf`; in development it is
 * `jp_csrf`. Both names are tried because the frontend does not know which
 * environment the API is running in, and getting this wrong fails only in
 * production, only on mutations.
 */
function readCsrfToken(): string | null {
  for (const name of ["__Host-jp_csrf", "jp_csrf"]) {
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
 * DEPLOYMENT NOTE — read before deciding where to host these two apps.
 *
 * `COOKIE_SAMESITE` defaults to `strict`, and SameSite compares *sites*
 * (registrable domains), not origins. So:
 *
 *   - Same origin behind one proxy: works.
 *   - `app.example.com` → `api.example.com`: same site, different origin. The
 *     cookie IS sent under `strict`; CORS needs the exact origin allowlisted
 *     (`CLIENT_URLS`) and this file's `withCredentials`. Works unchanged.
 *   - `app.vercel.app` → `api.onrender.com`: different registrable domains,
 *     genuinely cross-site. `strict` withholds every session cookie and nothing
 *     in this file can fix it — set `COOKIE_SAMESITE=none` (HTTPS on both,
 *     which `__Host-` requires anyway). That is what the variable is for, and
 *     using it is not the "weaken a cookie flag" the guardrail forbids; editing
 *     the default in code would be.
 *
 * `__Host-` is compatible with all three: it forbids a `Domain` attribute, so
 * each origin sets its own cookie rather than one cookie spanning both. See
 * ADR-0005.
 */
apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (method !== "get" && method !== "head") {
    const token = readCsrfToken();
    if (token) config.headers.set("X-CSRF-Token", token);
  }
  return config;
});

/** Marks a request that has already been retried, so a retry cannot recurse. */
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * The in-flight refresh, shared by every 401 that arrives while it is pending.
 *
 * This is the whole point. Six components mounting at once produce six 401s;
 * without this they produce six POST /refresh calls, five of which present a
 * token the first has already rotated. The reuse detector reads that as theft
 * and revokes the entire family — the user is logged out by their own page
 * load. One promise, awaited by all six.
 */
let refreshInFlight: Promise<void> | null = null;

/** Session ended for real. `useAuthBootstrap` wires the store teardown here. */
let onSessionLost: () => void = () => {};
export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

function refreshOnce(portal: string): Promise<void> {
  refreshInFlight ??= apiClient
    .post(`/${portal}/auth/refresh`)
    .then(() => undefined)
    .finally(() => {
      // Cleared in `finally`, not `then`: leaving a rejected promise cached
      // means every later 401 re-rejects with a stale error and the user can
      // never recover without a hard reload.
      refreshInFlight = null;
    });
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? "";

    // Not a 401, no config to replay, or already retried once: give up.
    if (status !== 401 || !config || config._retried) throw error;

    // Never refresh in response to an auth endpoint's own 401. `/refresh`
    // 401ing means the refresh token is dead; `/login` 401ing means wrong
    // password. Retrying either is at best pointless and at worst an infinite
    // loop between the interceptor and itself.
    if (url.includes("/auth/refresh") || url.includes("/auth/login")) {
      if (url.includes("/auth/refresh")) onSessionLost();
      throw error;
    }

    const portal = getPortalHint();
    if (!portal) throw error; // never signed in here; nothing to refresh

    config._retried = true;
    try {
      await refreshOnce(portal);
    } catch {
      onSessionLost();
      throw error; // the ORIGINAL error — the refresh failure is an internal detail
    }
    return apiClient(config);
  },
);
