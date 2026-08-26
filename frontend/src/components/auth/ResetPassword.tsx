import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Portal } from "@jobportal/shared";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { usePortalParam } from "@/hooks/usePortalParam";

/**
 * Two screens, one form. Both redeem a `reset_password` code and rotate the
 * credential through the same endpoint; what differs is who is standing there.
 *
 * - `reset` — the recovery flow, reached from "Forgot password?". The reader has
 *   an account and a password they cannot recall.
 * - `setup` — an admin invited by another admin. Their row was created with
 *   `passwordHash: null` and they have never had a password, so "choose a NEW
 *   password" and "remembered it?" both describe a situation they are not in.
 *
 * `portal` pins the portal from a route literal instead of `?portal=`, which is
 * how /admin/set-password resolves admin from a link that carries only an email
 * address. Reset keeps reading the parameter: its four entry points are
 * portal-neutral paths reached by redirect.
 */
type Variant = "reset" | "setup";

const COPY: Record<
  Variant,
  { title: string; submit: string; busy: string; done: string; field: string; hint: string }
> = {
  reset: {
    title: "Choose a new password",
    submit: "Change password",
    busy: "Changing...",
    done: "Password changed. Sign in with your new password.",
    field: "New password",
    hint: "At least 12 characters, and not one you have used before.",
  },
  setup: {
    title: "Set your password",
    submit: "Set password",
    busy: "Setting...",
    done: "Password set. Sign in to the console.",
    field: "Password",
    // No reuse clause: `passwordHash` is null on an invited admin, so there is
    // no previous credential for the check to compare against.
    hint: "At least 12 characters.",
  },
};

const ResetPassword = ({
  portal: pinnedPortal,
  variant = "reset",
}: { portal?: Portal; variant?: Variant } = {}) => {
  // Called unconditionally — hooks must be — then overridden by the literal.
  const paramPortal = usePortalParam();
  const portal = pinnedPortal ?? paramPortal;
  const [params] = useSearchParams();
  const [input, setInput] = useState({
    email: params.get("email") ?? "",
    code: "",
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];
  const text = COPY[variant];

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setBusy(true);
      await apiClient.post(`/${portal}/auth/reset-password`, input);
      // No session is issued after a reset, so none is set here either. The
      // destination is portal-aware: the inherited version sent everyone to
      // /login, which drops a recruiter on a form their credentials fail.
      toast.success(text.done);
      navigate(copy.loginHref, { replace: true });
    } catch (error) {
      // PASSWORD_REUSED is the one code here the user can actually act on, so
      // its own message is worth showing rather than a generic failure.
      if (getApiErrorCode(error) === "PASSWORD_REUSED") {
        toast.error(
          getApiErrorMessage(error, "Choose a password you have not used before"),
        );
        return;
      }
      toast.error(getApiErrorMessage(error, "That code did not work"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout portal={portal} title={text.title}>
      <p className="-mt-6 mb-8 text-sm text-ink-muted">
        {variant === "setup" ? "Your admin account was created for you. Enter the code we emailed to " : "Enter the code we emailed to "}
        <span className="font-medium text-ink">{input.email}</span>.
      </p>

      <form onSubmit={submitHandler} noValidate>
        <FormField label="Code" htmlFor="code" hint="Six digits, valid for 10 minutes." required>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={input.code}
            onChange={(e) => setInput({ ...input, code: e.target.value })}
            placeholder="123456"
            className="font-mono"
          />
        </FormField>

        <FormField label={text.field} htmlFor="newPassword" hint={text.hint} required>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            value={input.newPassword}
            onChange={(e) => setInput({ ...input, newPassword: e.target.value })}
            placeholder={variant === "setup" ? "Choose a password" : "Choose a new password"}
          />
        </FormField>

        <Button type="submit" variant="signal" className="mt-2 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {busy ? text.busy : text.submit}
        </Button>

        <p className="mt-5 text-sm text-ink-muted">
          Didn&apos;t receive a code?{" "}
          <Link
            to={`/forgot-password?portal=${portal}&email=${encodeURIComponent(input.email)}`}
            className="text-signal-text hover:underline"
          >
            Request a new one
          </Link>
        </p>

        {/* Only on reset. An invited admin has no password to have remembered,
            and the link would send them to a form no credential of theirs opens. */}
        {variant === "reset" ? (
          <p className="mt-3 text-sm text-ink-muted">
            Remembered it?{" "}
            <Link to={copy.loginHref} className="text-signal-text hover:underline">
              Back to sign in
            </Link>
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
