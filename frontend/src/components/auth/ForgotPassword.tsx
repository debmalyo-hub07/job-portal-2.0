import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { usePortalParam } from "@/hooks/usePortalParam";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { turnstileEnabled, turnstileRequestConfig } from "@/lib/turnstile";
import { TurnstileChallenge } from "./TurnstileChallenge";

const ForgotPassword = () => {
  const portal = usePortalParam();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post(
        `/${portal}/auth/forgot-password`,
        { email },
        ...turnstileRequestConfig(botToken),
      );
      toast.success("If that address has an account, a reset code is on its way.");
      navigate(`/reset-password?portal=${portal}&email=${encodeURIComponent(email)}`);
    } catch (error) {
      const code = getApiErrorCode(error);
      setBotToken(null);
      setChallengeKey((value) => value + 1);

      if (code === "BOT_VERIFICATION_FAILED") {
        toast.error("Verification failed. Try again.");
      } else if (code === "RATE_LIMITED") {
        toast.error("Too many codes requested. Try again later.");
      } else {
        toast.error(getApiErrorMessage(error, "Could not request a reset code"));
      }
    } finally {
      setBusy(false);
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
            spellCheck={false}
          />
        </FormField>

        <TurnstileChallenge
          action={`${portal}_recovery`}
          onToken={setBotToken}
          resetKey={challengeKey}
        />

        <Button
          type="submit"
          variant="signal"
          className="mt-2 w-full"
          disabled={busy || (turnstileEnabled && !botToken)}
        >
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {busy ? "Sending..." : "Send reset code"}
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
