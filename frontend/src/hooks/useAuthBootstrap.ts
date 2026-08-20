import { useEffect, useRef } from "react";
import type { Portal, SessionUser } from "@jobportal/shared";
import { apiClient, setCsrfToken, setSessionLostHandler } from "@/lib/apiClient";
import { activatePortal, clearPortalHint, getPortalHint, setPortalHint } from "@/lib/portal";
import {
  clearPortalSession,
  portalIsBootstrapped,
  setActivePortal,
  setBootstrapped,
  setPortalBootstrapped,
  setPortalSession,
  userForPortal,
} from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

type MeResponse = { success: true; user: SessionUser; csrfToken?: string };
const inFlight = new Map<Portal, Promise<MeResponse>>();

function loadSession(portal: Portal): Promise<MeResponse> {
  const existing = inFlight.get(portal);
  if (existing) return existing;

  const request = apiClient
    .get<MeResponse>(`/${portal}/auth/me`)
    .then((response) => response.data)
    .finally(() => inFlight.delete(portal));
  inFlight.set(portal, request);
  return request;
}

/**
 * Asks the server who this browser is, once, at startup.
 *
 * Persisted state is a cache, not a source of truth: the cookie may have expired,
 * been revoked from another tab, or the account may have been suspended, and none
 * of that touches localStorage. `/me` is the only authority. Until it answers,
 * `bootstrapped` is false and the guards wait.
 */
export function useAuthBootstrap(requestedPortal?: Portal): void {
  const dispatch = useAppDispatch();
  const legacyPortal = useAppSelector((state) => state.auth.user?.portal ?? null);
  const fallbackPortal = useRef(getPortalHint() ?? legacyPortal).current;
  const portal = requestedPortal ?? fallbackPortal;
  const cachedUser = useAppSelector((state) =>
    portal ? userForPortal(state.auth, portal) : null,
  );
  // The cached user is a bootstrap hint, not an effect trigger. The /me success
  // path writes the live user into Redux; depending on that changing value here
  // starts the same bootstrap again before the portal flag settles and can leave
  // protected routes permanently empty (and repeatedly call /me in a browser).
  // PersistGate has already completed before this hook renders, so the value from
  // this render is the only cache state this request needs to inspect.
  const cachedUsersAtBootstrap = useRef<Partial<Record<Portal, SessionUser | null>>>({});
  if (portal && !(portal in cachedUsersAtBootstrap.current)) {
    cachedUsersAtBootstrap.current[portal] = cachedUser;
  }
  const bootstrapped = useAppSelector((state) =>
    portal ? portalIsBootstrapped(state.auth, portal) : state.auth.bootstrapped,
  );

  useEffect(() => {
    setSessionLostHandler((lostPortal) => {
      clearPortalHint(lostPortal);
      setCsrfToken(lostPortal, null);
      dispatch(clearPortalSession(lostPortal));
    });

    if (!portal) {
      dispatch(setBootstrapped(true));
      return;
    }

    activatePortal(portal);
    dispatch(setActivePortal(portal));
    if (bootstrapped) return;

    // A cache entry is only a hint that a httpOnly session may exist. The old
    // single-portal hint is kept as a one-release migration path for browsers
    // that signed in before portal-scoped caches shipped.
    if (!cachedUsersAtBootstrap.current[portal] && getPortalHint() !== portal) {
      dispatch(setPortalBootstrapped({ portal, value: true }));
      return;
    }

    let cancelled = false;
    loadSession(portal)
      .then((data) => {
        if (!cancelled) {
          // Re-arms the in-memory CSRF token. A hard reload — and the top-level
          // redirect the Google callback performs — starts with nothing in
          // memory, and the cookie cannot be read back cross-site, so without
          // this the first mutation after any reload 403s.
          if (data.csrfToken) setCsrfToken(portal, data.csrfToken);
          setPortalHint(portal);
          dispatch(setPortalSession({ portal, user: data.user }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearPortalHint(portal);
          setCsrfToken(portal, null);
          dispatch(clearPortalSession(portal));
        }
      })
      .finally(() => {
        if (!cancelled) dispatch(setPortalBootstrapped({ portal, value: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, dispatch, portal]);
}
