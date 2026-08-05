import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { usePortalParam } from "@/hooks/usePortalParam";

const ForgotPassword = () => {
  const portal = usePortalParam();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post(`/${portal}/auth/forgot-password`, { email });
    } catch {
      // Swallowed on purpose. The endpoint is non-committal about whether the
      // address exists — it sends a ghost OTP either way — and a UI that says
      // "no account with that email" hands back the enumeration oracle the
      // backend just spent effort closing. Every outcome looks identical.
    } finally {
      setBusy(false);
      navigate(`/reset-password?portal=${portal}&email=${encodeURIComponent(email)}`);
    }
  };

  return (
    <AuthLayout
      portal={portal}
      title="Reset your password"
      subtitle="We'll email you a code if that address has an account."
    >
      <form onSubmit={submitHandler} noValidate>
        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </FormField>

        <Button type="submit" variant="signal" className="mt-2 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? "Sending" : "Send reset code"}
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

export default ForgotPassword;
