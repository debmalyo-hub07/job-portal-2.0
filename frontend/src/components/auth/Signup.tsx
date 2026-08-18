import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Portal } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { turnstileEnabled, turnstileRequestConfig } from "@/lib/turnstile";
import { setLoading } from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TurnstileChallenge } from "./TurnstileChallenge";

/**
 * Portal comes from the route. The inherited form asked for it in a radio pair
 * placed *below* name, email, phone and password — the first decision presented
 * last — and that decision is now made by which URL you are on.
 */
const Signup = ({ portal }: { portal: Portal }) => {
  const [input, setInput] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [botToken, setBotToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const { loading } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const copy = AUTH_COPY[portal];

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      dispatch(setLoading(true));
      // JSON, not multipart: the endpoint takes no file. `phone` is optional and
      // omitted entirely when blank — an empty string fails E.164.
      await apiClient.post(
        `/${portal}/auth/register`,
        {
          fullName: input.fullName,
          email: input.email,
          password: input.password,
          ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
        },
        ...turnstileRequestConfig(botToken),
      );
      // Deliberately no setUser: the API issues no session before verification,
      // so a user here would be a UI that thinks it is signed in and a server
      // that disagrees on the next request.
      navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Signup failed"));
      setBotToken(null);
      setChallengeKey((value) => value + 1);
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <AuthLayout
      portal={portal}
      title={portal === "recruiter" ? "Start hiring" : "Create your account"}
      subtitle={
        portal === "recruiter"
          ? "Free to post. No card required."
          : "Takes a minute. No cover letter required."
      }
    >
      <form onSubmit={submitHandler} noValidate>
        <FormField label="Full name" htmlFor="fullName" required>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            value={input.fullName}
            onChange={changeEventHandler}
            placeholder="Your name"
          />
        </FormField>

        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={input.email}
            onChange={changeEventHandler}
            placeholder="you@example.com"
            spellCheck={false}
          />
        </FormField>

        <FormField
          label="Phone"
          htmlFor="phone"
          hint="Optional. Include the country code, e.g. +919876543210."
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={input.phone}
            onChange={changeEventHandler}
            placeholder="+919876543210"
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="password"
          hint="At least 12 characters."
          required
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            value={input.password}
            onChange={changeEventHandler}
            placeholder="Choose a password"
          />
        </FormField>

        <TurnstileChallenge
          action={`${portal}_register`}
          onToken={setBotToken}
          resetKey={challengeKey}
        />

        <Button
          type="submit"
          variant="signal"
          className="mt-2 w-full"
          disabled={loading || (turnstileEnabled && !botToken)}
        >
          {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {loading ? "Creating account..." : "Create account"}
        </Button>

        <p className="mt-6 text-sm text-ink-muted">
          Already have an account?{" "}
          <Link to={copy.loginHref} className="text-signal-text hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Signup;
