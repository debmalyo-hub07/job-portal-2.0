import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse, Portal } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { setLoading, setUser } from "@/redux/authSlice";
import { setPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const Login = () => {
  /**
   * This radio looks like the defect it replaces, so: it no longer sends a
   * `role` in the body for the server to trust. It picks which URL to post to.
   * An account exists in exactly one collection (ADR-0001), so choosing the
   * wrong portal produces INVALID_CREDENTIALS and nothing else — it cannot
   * grant a role, because there is no role field left to grant.
   */
  const [portal, setPortal] = useState<Portal>("seeker");
  const [input, setInput] = useState({ email: "", password: "" });
  const { loading, user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({
      ...input,
      [e.target.name]: e.target.value,
    });
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
      navigate("/");
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
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <form
          onSubmit={submitHandler}
          className="w-1/2 border border-gray-200 rounded-md p-4 my-10"
        >
          <h1 className="font-bold text-xl mb-5">Login</h1>
          <div className="my-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={input.email}
              name="email"
              onChange={changeEventHandler}
              placeholder="Enter Your Email"
            />
          </div>
          <div className="my-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={input.password}
              name="password"
              onChange={changeEventHandler}
              placeholder="Enter Your Password"
            />
          </div>
          <div className="flex items-center justify-between">
            <RadioGroup className="flex items-center gap-4 my-5">
              <div className="flex items-center space-x-2">
                <Input
                  type="radio"
                  name="portal"
                  value="seeker"
                  checked={portal === "seeker"}
                  onChange={() => setPortal("seeker")}
                  className="cursor-pointer"
                />
                <Label>Job seeker</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="radio"
                  name="portal"
                  value="recruiter"
                  checked={portal === "recruiter"}
                  onChange={() => setPortal("recruiter")}
                  className="cursor-pointer"
                />
                <Label>Recruiter</Label>
              </div>
            </RadioGroup>
            <Link
              to={`/forgot-password?portal=${portal}`}
              className="text-sm text-signal-text"
            >
              Forgot password?
            </Link>
          </div>
          {loading ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Login
            </Button>
          )}
          {/*
            A real navigation, not a fetch: the OAuth flow is a series of
            top-level redirects and XHR cannot follow them.
          */}
          <Button
            type="button"
            variant="outline"
            className="w-full mb-4"
            onClick={() => {
              window.location.href = `${import.meta.env.VITE_API_URL}/${portal}/auth/google`;
            }}
          >
            Continue with Google
          </Button>
          <span className="text-sm">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="text-signal-text">
              Signup
            </Link>
          </span>
        </form>
      </div>
    </div>
  );
};

export default Login;
