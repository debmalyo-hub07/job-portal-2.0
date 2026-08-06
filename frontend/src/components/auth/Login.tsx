import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse, Portal } from "@jobportal/shared";

import { AuthLayout } from "./AuthLayout";
import { AUTH_COPY } from "./authCopy";
import { FormField } from "../layout/FormField";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { setLoading, setUser } from "@/redux/authSlice";
import { setPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";

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
  const { loading, user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const copy = AUTH_COPY[portal];
  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      dispatch(setLoading(true));
      const res = await apiClient.post<AuthResponse>(`/${portal}/auth/login`, input);
      // Hint written only after the server agreed. Writing it before would leave
      // a failed login pointing the refresh interceptor at the wrong portal.
      setPortalHint(portal);
      dispatch(setUser(res.data.user));
      navigate(portal === "recruiter" ? "/admin/companies" : "/");
    } catch (error) {
      // EMAIL_NOT_VERIFIED is not a failure the user can act on from here — it
      // means "finish signing up". Route them instead of showing a dead end.
      if (getApiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
        navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
        return;
      }
      toast.error(getApiErrorMessage(error, "Login failed"));
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    if (user) navigate(user.portal === "recruiter" ? "/admin/companies" : "/");
  }, [user, navigate]);

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
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
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

        <Button type="submit" variant="signal" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          {loading ? "Signing in" : "Sign in"}
        </Button>

        {/*
          A real navigation, not a fetch: the OAuth flow is a series of top-level
          redirects and XHR cannot follow them.
        */}
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            window.location.href = `${import.meta.env.VITE_API_URL}/${portal}/auth/google`;
          }}
        >
          Continue with Google
        </Button>

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
