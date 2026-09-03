import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { AuthResponse } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { setPortalHint } from "@/lib/portal";
import { landingAfterAuth } from "@/lib/portalHome";
import { setUser } from "@/redux/authSlice";
import { usePortalParam } from "@/hooks/usePortalParam";
import { useAppDispatch } from "@/redux/store";

/**
 * The Google success landing, where the session is actually established.
 *
 * It does NOT read cookies the callback set. It cannot: the callback is a
 * top-level navigation to the API host, the web app is on a different
 * registrable domain, and cross-site the browser stores those cookies against
 * the API host as a first party and then withholds them from this page's XHR.
 * Measured in production — the callback signed a seeker in three times in one
 * day and every following `/me` arrived with no cookie at all, so this component
 * reported "Sign-in failed" on a sign-in that had entirely succeeded.
 *
 * Instead the callback hands over a one-time code and this page redeems it. The
 * session cookies then arrive on a response to a request the SPA itself made —
 * the only path this deployment has ever delivered them on, as password login
 * and refresh rotation both demonstrate.
 */
const AuthComplete = () => {
  const portal = usePortalParam();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get("code");

  useEffect(() => {
    const failed = `/auth/error?code=GOOGLE_AUTH_FAILED&portal=${portal}`;
    // No code means this URL was not built by the callback — a stale bookmark,
    // a hand-edited address, or a Back into a spent redirect. Nothing to
    // redeem, so nothing is sent.
    if (!code) {
      navigate(failed, { replace: true });
      return;
    }

    setPortalHint(portal);
    apiClient
      .post<AuthResponse>(`/${portal}/auth/google/exchange`, { code })
      .then((res) => {
        setCsrfToken(portal, res.data.csrfToken ?? null);
        dispatch(setUser(res.data.user));
        // `replace` on both paths, and it does double duty here: it keeps Back
        // from returning to a callback URL carrying a spent `code` and `state`
        // (which fails and looks like a bug), and it drops the handoff code out
        // of the address bar and the history entry as soon as it is spent.
        //
        // `landingAfterAuth`, not `homePathFor`: a Google registration reaches
        // this component with a brand-new account and no date of birth. Sending
        // it to the board would let it past the identity step entirely, and the
        // first thing it heard about the gate would be a 403 on an application.
        navigate(landingAfterAuth(res.data.user), {
          replace: true,
          viewTransition: true,
        });
      })
      .catch(() => navigate(failed, { replace: true }));
  }, [portal, code, dispatch, navigate]);

  return (
    <AuthLayout portal={portal} title="Signing you in">
      <p className="text-sm text-ink-muted">One moment while we finish up.</p>
    </AuthLayout>
  );
};

export default AuthComplete;
