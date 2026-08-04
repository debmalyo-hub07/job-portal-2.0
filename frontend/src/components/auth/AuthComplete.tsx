import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AuthResponse } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import { apiClient } from "@/lib/apiClient";
import { setPortalHint } from "@/lib/portal";
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
        dispatch(setUser(res.data.user));
        // `replace` on both paths: without it, Back returns to a callback URL
        // carrying a spent `code` and `state`, which fails and looks like a bug.
        navigate("/", { replace: true });
      })
      .catch(() => navigate("/auth/error?code=GOOGLE_AUTH_FAILED", { replace: true }));
  }, [portal, dispatch, navigate]);

  return (
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <p className="my-20 text-gray-600">Signing you in…</p>
      </div>
    </div>
  );
};

export default AuthComplete;
