import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse, Portal } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Button } from "../ui/button";
import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { setLoading, setUser } from "@/redux/authSlice";
import { setPortalHint } from "@/lib/portal";
import { loginDestination } from "@/lib/portalHome";
import { turnstileEnabled, turnstileRequestConfig } from "@/lib/turnstile";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TurnstileChallenge } from "./TurnstileChallenge";

/**
 * The portal arrives as a prop from the route, never from component state.
 *
 * The version this replaces held it in `useState` and rendered a radio pair, so
 * the endpoint the form posted to and the signal colour PortalScope resolved
 * from the URL could disagree — /login always looked like the seeker portal even
 * with "Recruiter" selected. One route, one portal, no control.
 */
const Login = ({ portal }: { portal: Portal }) => {
  const [input, setInput] = useState({ email: "", password: "" });
  const [botToken, setBotToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const { loading } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const copy = AUTH_COPY[portal];
  // A local const so the narrowing below survives into the onClick closure.
  const googleStartPath = copy.googleStartPath;
  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      dispatch(setLoading(true));
      const res = await apiClient.post<AuthResponse>(
        `/${portal}/auth/login`,
        input,
        ...turnstileRequestConfig(botToken),
      );
      // Hint written only after the server agreed. Writing it before would leave
      // a failed login pointing the refresh interceptor at the wrong portal.
      setPortalHint(portal);
      setCsrfToken(portal, res.data.csrfToken ?? null);
      dispatch(setUser(res.data.user));
      navigate(loginDestination(res.data.user, location.state), { replace: true });
    } catch (error) {
      // EMAIL_NOT_VERIFIED is not a failure the user can act on from here — it
      // means "finish signing up". Route them instead of showing a dead end.
      if (getApiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
        navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
        return;
      }
      toast.error(getApiErrorMessage(error, "Login failed"));
      setBotToken(null);
      setChallengeKey((value) => value + 1);
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <AuthLayout
      portal={portal}
      title="Welcome back"
      subtitle={
        portal === "recruiter"
          ? "Sign in to your hiring account."
          : "Sign in to pick up where you left off."
      }
    >
      <form onSubmit={submitHandler} noValidate>
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

        <FormField label="Password" htmlFor="password" required>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={input.password}
            onChange={changeEventHandler}
            placeholder="Your password"
          />
        </FormField>

        <div className="mb-6 text-right">
          <Link
            to={`/forgot-password?portal=${portal}`}
            className="text-sm text-signal-text hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <TurnstileChallenge
          action={`${portal}_login`}
          onToken={setBotToken}
          resetKey={challengeKey}
        />

        <Button
          type="submit"
          variant="signal"
          className="w-full"
          disabled={loading || (turnstileEnabled && !botToken)}
        >
          {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        {/*
          Only where the API mounts the route — see authCopy.

          The rule and its label are structure, not decoration: password and
          Google are alternative ways in, and stacking two full-width buttons
          with nothing between them read as a sequence — a second submit under
          the first. The rules are decorative, so they are hidden; the word is
          the part that carries the meaning, so it is not.
        */}
        {googleStartPath ? (
          <>
            <div className="my-5 flex items-center gap-3">
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
              <span className="font-mono text-[0.68rem] uppercase text-ink-muted">or</span>
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </div>
            <GoogleButton startPath={googleStartPath} />
          </>
        ) : null}

        {/* No self-service registration on admin — admins are seeded, then
            created by an existing admin. */}
        {copy.signupHref ? (
          <p className="mt-6 text-sm text-ink-muted">
            Don&apos;t have an account?{" "}
            <Link to={copy.signupHref} className="text-signal-text hover:underline">
              Create one
            </Link>
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
};

export default Login;
