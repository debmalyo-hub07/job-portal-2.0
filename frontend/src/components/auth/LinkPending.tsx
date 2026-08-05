import { Link } from "react-router-dom";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { usePortalParam } from "@/hooks/usePortalParam";

/**
 * The step-up branch: a Google identity arrived for an address that already has
 * a password account, so linking needs proof of the mailbox. There is
 * deliberately nothing to submit here — the whole point is that the browser
 * cannot complete this step.
 *
 * The backend redirects here without a ?portal=, so usePortalParam falls back to
 * seeker — matching PortalScope's own default for an unprefixed route.
 */
const LinkPending = () => {
  const portal = usePortalParam();
  const copy = AUTH_COPY[portal];

  return (
    <AuthLayout portal={portal} title="Check your email">
      <p className="text-sm text-ink-muted">
        An account already exists for that address. We have sent a confirmation
        link to it — open the link to connect your Google sign-in. Until then
        nothing has changed, and you can still sign in with your password.
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

export default LinkPending;
