import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Loader2 } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
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
  const copy = AUTH_COPY[portal];

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
      setError(
        getApiErrorMessage(err, "That confirmation link is invalid or has expired."),
      );
      setState("idle");
    }
  };

  return (
    <AuthLayout portal={portal} title="Connect Google sign-in">
      {state === "done" ? (
        <>
          {/* Icon AND label — semantic state is never colour alone. */}
          <p className="flex items-start gap-2 text-sm text-ink">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok-text" />
            <span>Done. You can now use “Continue with Google” to sign in.</span>
          </p>
          <Link
            to={copy.loginHref}
            className="mt-6 inline-block text-sm text-signal-text hover:underline"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-ink-muted">
            Confirm that you want to connect your Google account to this email
            address.
          </p>
          {error ? (
            <p role="alert" className="mb-4 text-sm text-danger-text">
              {error}
            </p>
          ) : null}
          <Button
            variant="signal"
            className="w-full"
            onClick={confirm}
            disabled={state === "busy" || !token}
          >
            {state === "busy" ? <Loader2 className="animate-spin" /> : null}
            Confirm
          </Button>
          <Link
            to={copy.loginHref}
            className="mt-6 inline-block text-sm text-signal-text hover:underline"
          >
            Back to sign in
          </Link>
        </>
      )}
    </AuthLayout>
  );
};

export default ConfirmGoogleLink;
