import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
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

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setBusy(true);
      await apiClient.post(`/${portal}/auth/reset-password`, input);
      // No session is issued after a reset, so none is set here either.
      toast.success("Password changed. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (error) {
      // PASSWORD_REUSED is the one code here the user can actually act on, so
      // its own message is worth showing rather than a generic failure.
      if (getApiErrorCode(error) === "PASSWORD_REUSED") {
        toast.error(getApiErrorMessage(error, "Choose a password you have not used before"));
        return;
      }
      toast.error(getApiErrorMessage(error, "That code did not work"));
    } finally {
      setBusy(false);
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
          <h1 className="font-bold text-xl mb-2">Choose a new password</h1>
          <p className="text-sm text-gray-600 mb-5">
            Enter the code we emailed to{" "}
            <span className="font-medium">{input.email}</span>.
          </p>
          <div className="my-2">
            <Label>Code</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={input.code}
              onChange={(e) => setInput({ ...input, code: e.target.value })}
              placeholder="123456"
            />
          </div>
          <div className="my-2">
            <Label>New password</Label>
            <Input
              type="password"
              value={input.newPassword}
              onChange={(e) => setInput({ ...input, newPassword: e.target.value })}
              placeholder="At least 12 characters"
            />
          </div>
          {busy ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Change password
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
