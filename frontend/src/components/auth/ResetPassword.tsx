import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { usePortalParam } from "@/hooks/usePortalParam";

const ResetPassword = () => {
  const portal = usePortalParam();
  const [params] = useSearchParams();
  const [input, setInput] = useState({
    email: params.get("email") ?? "",
    code: "",
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setBusy(true);
      await apiClient.post(`/${portal}/auth/reset-password`, input);
      // No session is issued after a reset, so none is set here either. The
      // destination is portal-aware: the inherited version sent everyone to
      // /login, which drops a recruiter on a form their credentials fail.
      toast.success("Password changed. Sign in with your new password.");
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
    <AuthLayout portal={portal} title="Choose a new password">
      <p className="-mt-6 mb-8 text-sm text-ink-muted">
        Enter the code we emailed to{" "}
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

        <FormField
          label="New password"
          htmlFor="newPassword"
          hint="At least 12 characters, and not one you have used before."
          required
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={input.newPassword}
            onChange={(e) => setInput({ ...input, newPassword: e.target.value })}
            placeholder="Choose a new password"
          />
        </FormField>

        <Button type="submit" variant="signal" className="mt-2 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {busy ? "Changing..." : "Change password"}
        </Button>

        <p className="mt-6 text-sm text-ink-muted">
          Remembered it?{" "}
          <Link to={copy.loginHref} className="text-signal-text hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
