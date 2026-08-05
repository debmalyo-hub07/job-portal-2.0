import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import Navbar from "../shared/Navbar";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { usePortalParam } from "@/hooks/usePortalParam";

const ConfirmGoogleLink = () => {
  const portal = usePortalParam();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * A button, not a `useEffect`. Mail clients and security scanners prefetch
   * links, and an auto-submitting page lets a scanner burn the single-use token
   * before the human ever clicks it.
   */
  const confirm = async () => {
    try {
      setState("busy");
      setError(null);
      await apiClient.post(`/${portal}/auth/google/confirm-link`, { token });
      setState("done");
    } catch (err) {
      setError(getApiErrorMessage(err, "That confirmation link is invalid or has expired."));
      setState("idle");
    }
  };

  return (
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <div className="w-1/2 border border-gray-200 rounded-md p-4 my-10">
          <h1 className="font-bold text-xl mb-2">Connect Google sign-in</h1>
          {state === "done" ? (
            <>
              <p className="text-sm text-gray-600">
                Done. You can now use “Continue with Google” to sign in.
              </p>
              <Link to="/login" className="text-sm text-signal-text mt-4 inline-block">
                Go to login
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Confirm that you want to connect your Google account to this
                email address.
              </p>
              {error && <p className="text-sm text-danger mb-4">{error}</p>}
              <Button onClick={confirm} disabled={state === "busy" || !token}>
                {state === "busy" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmGoogleLink;
