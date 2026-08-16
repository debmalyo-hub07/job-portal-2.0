import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { AuthResponse } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { setPortalHint } from "@/lib/portal";
import { homePathFor } from "@/lib/portalHome";
import { setUser } from "@/redux/authSlice";
import { usePortalParam } from "@/hooks/usePortalParam";
import { useAppDispatch } from "@/redux/store";

/**
 * The Google success landing. Cookies are already set by the redirect that got
 * us here; this page only has to teach the client what happened.
 */
const AuthComplete = () => {
  const portal = usePortalParam();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    setPortalHint(portal);
    apiClient
      .get<AuthResponse>(`/${portal}/auth/me`)
      .then((res) => {
        setCsrfToken(res.data.csrfToken ?? null);
        dispatch(setUser(res.data.user));
        // `replace` on both paths: without it, Back returns to a callback URL
        // carrying a spent `code` and `state`, which fails and looks like a bug.
        //
        // Portal-aware destination: sign-in still enters the working surface,
        // while the public landing page remains available from its Home link.
        navigate(homePathFor(portal), { replace: true });
      })
      .catch(() => navigate("/auth/error?code=GOOGLE_AUTH_FAILED", { replace: true }));
  }, [portal, dispatch, navigate]);

  return (
    <AuthLayout portal={portal} title="Signing you in">
      <p className="text-sm text-ink-muted">One moment while we finish up.</p>
    </AuthLayout>
  );
};

export default AuthComplete;
