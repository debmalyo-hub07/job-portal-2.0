import { useEffect } from "react";
import type { SessionUser } from "@jobportal/shared";
import { apiClient, setCsrfToken, setSessionLostHandler } from "@/lib/apiClient";
import { clearPortalHint, getPortalHint } from "@/lib/portal";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * Asks the server who this browser is, once, at startup.
 *
 * Persisted state is a cache, not a source of truth: the cookie may have expired,
 * been revoked from another tab, or the account may have been suspended, and none
 * of that touches localStorage. `/me` is the only authority. Until it answers,
 * `bootstrapped` is false and the guards wait.
 */
export function useAuthBootstrap(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Registered before the request, so a 401 on /refresh during bootstrap
    // clears the stale user instead of leaving it on screen.
    setSessionLostHandler(() => {
      clearPortalHint();
      setCsrfToken(null);
      dispatch(setUser(null));
      dispatch(setBootstrapped(true));
    });

    const portal = getPortalHint();
    if (!portal) {
      // Never signed in on this browser. Do not call /me: it would 401, and a
      // 401 in the network tab on every anonymous visit trains people to ignore
      // 401s in the network tab.
      dispatch(setUser(null));
      dispatch(setBootstrapped(true));
      return;
    }

    let cancelled = false;
    apiClient
      .get<{ success: true; user: SessionUser; csrfToken?: string }>(`/${portal}/auth/me`)
      .then((res) => {
        if (!cancelled) {
          // Re-arms the in-memory CSRF token. A hard reload — and the top-level
          // redirect the Google callback performs — starts with nothing in
          // memory, and the cookie cannot be read back cross-site, so without
          // this the first mutation after any reload 403s.
          if (res.data.csrfToken) setCsrfToken(res.data.csrfToken);
          dispatch(setUser(res.data.user));
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearPortalHint();
          setCsrfToken(null);
          dispatch(setUser(null));
        }
      })
      .finally(() => {
        if (!cancelled) dispatch(setBootstrapped(true));
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}
