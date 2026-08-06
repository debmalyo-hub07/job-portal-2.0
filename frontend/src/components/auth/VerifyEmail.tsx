import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { setPortalHint } from "@/lib/portal";
import { usePortalParam } from "@/hooks/usePortalParam";
import { useAppDispatch } from "@/redux/store";

const VerifyEmail = () => {
  const portal = usePortalParam();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setBusy(true);
      const res = await apiClient.post<AuthResponse>(`/${portal}/auth/verify-email`, {
        email,
        code,
      });
      // Verification *does* issue a session, unlike registration.
      setPortalHint(portal);
      dispatch(setUser(res.data.user));
      navigate(portal === "recruiter" ? "/hire/companies" : "/", { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That code did not work"));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await apiClient.post(`/${portal}/auth/resend-code`, { email });
      toast.success("If that address needs a code, one is on its way.");
    } catch (error) {
      // Capped at 3/hour/email. The raw message is not the useful sentence here.
      if (getApiErrorCode(error) === "RATE_LIMITED") {
        toast.error("Too many codes requested. Try again later.");
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not resend the code"));
    }
  };

  return (
    <AuthLayout portal={portal} title="Verify your email">
      <p className="-mt-6 mb-8 text-sm text-ink-muted">
        We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
      </p>

      <form onSubmit={submitHandler} noValidate>
        <FormField label="Code" htmlFor="code" hint="Six digits, valid for 10 minutes." required>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="font-mono tracking-widest"
          />
        </FormField>

        <Button type="submit" variant="signal" className="mt-2 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? "Verifying" : "Verify"}
        </Button>

        <Button type="button" variant="outline" className="mt-3 w-full" onClick={resend}>
          Resend code
        </Button>

        {/* Only where self-service registration exists — see authCopy. */}
        {copy.signupHref ? (
          <p className="mt-6 text-sm text-ink-muted">
            Wrong address?{" "}
            <Link to={copy.signupHref} className="text-signal-text hover:underline">
              Sign up again
            </Link>
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
};

export default VerifyEmail;
