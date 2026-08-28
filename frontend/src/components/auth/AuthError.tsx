import { Link, useSearchParams } from "react-router";
import { AlertTriangle } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { usePortalParam } from "@/hooks/usePortalParam";

const MESSAGES: Record<string, string> = {
  GOOGLE_AUTH_FAILED: "Google sign-in could not be completed.",
  // The Google callback's cross-portal refusal: the address already holds an
  // account, so Google cannot mint a second one. The sentence matches
  // register()'s EMAIL_TAKEN answer, which requires no proof at all to
  // receive — naming it here discloses nothing and gives the owner a next
  // step instead of a dead end.
  EMAIL_TAKEN: "An account already exists for this email address. Sign in with your password instead.",
  GOOGLE_LINK_INVALID: "That confirmation link is invalid or has expired.",
};

const AuthError = () => {
  const portal = usePortalParam();
  const [params] = useSearchParams();
  const copy = AUTH_COPY[portal];
  // The *mapped* string only. The raw parameter is attacker-controlled text on a
  // page of ours, and rendering it turns a bookmarkable URL into a way to put
  // arbitrary words in our own voice.
  const message =
    MESSAGES[params.get("code") ?? ""] ?? "Something went wrong while signing you in.";

  return (
    <AuthLayout portal={portal} title="Sign-in failed">
      {/* Icon AND label — semantic state is never colour alone. */}
      <p className="flex items-start gap-2 text-sm text-ink">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
        <span>{message}</span>
      </p>
      <Link
        to={copy.loginHref}
        className="mt-6 inline-block text-sm text-signal-text hover:underline"
      >
        Back to sign in
      </Link>
    </AuthLayout>
  );
};

export default AuthError;
