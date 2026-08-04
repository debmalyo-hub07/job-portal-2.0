import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { usePortalParam } from "@/hooks/usePortalParam";

const ForgotPassword = () => {
  const portal = usePortalParam();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

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
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <form
          onSubmit={submitHandler}
          className="w-1/2 border border-gray-200 rounded-md p-4 my-10"
        >
          <h1 className="font-bold text-xl mb-2">Reset your password</h1>
          <p className="text-sm text-gray-600 mb-5">
            Enter your email and we will send a reset code if an account exists.
          </p>
          <div className="my-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter Your Email"
            />
          </div>
          {busy ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Send reset code
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
