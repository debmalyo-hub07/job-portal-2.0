import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AuthResponse } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
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
      navigate("/", { replace: true });
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
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <form
          onSubmit={submitHandler}
          className="w-1/2 border border-gray-200 rounded-md p-4 my-10"
        >
          <h1 className="font-bold text-xl mb-2">Verify your email</h1>
          <p className="text-sm text-gray-600 mb-5">
            We sent a 6-digit code to <span className="font-medium">{email}</span>.
          </p>
          <div className="my-2">
            <Label>Code</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          {busy ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Verify
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full mb-4" onClick={resend}>
            Resend code
          </Button>
          <span className="text-sm">
            Wrong address?{" "}
            <Link to="/signup" className="text-blue-600">
              Sign up again
            </Link>
          </span>
        </form>
      </div>
    </div>
  );
};

export default VerifyEmail;
