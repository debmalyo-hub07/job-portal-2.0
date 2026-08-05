import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Portal } from "@jobportal/shared";

import Navbar from "../shared/Navbar";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { Button } from "../ui/button";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setLoading } from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const Signup = () => {
  const [portal, setPortal] = useState<Portal>("seeker");
  const [input, setInput] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });
  const { loading, user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

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
      // JSON, not multipart: the new endpoint takes no file. `phone` is optional
      // and omitted entirely when blank — an empty string fails E.164.
      await apiClient.post(`/${portal}/auth/register`, {
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
      });
      // Deliberately no setUser: the API issues no session before verification,
      // so a user here would be a UI that thinks it is signed in and a server
      // that disagrees on the next request.
      navigate(`/verify-email?portal=${portal}&email=${encodeURIComponent(input.email)}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Signup failed"));
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
          <h1 className="font-bold text-xl mb-5">Sign Up</h1>
          <div className="my-2">
            <Label>Full Name</Label>
            <Input
              type="text"
              value={input.fullName}
              name="fullName"
              onChange={changeEventHandler}
              placeholder="Enter Your Name"
            />
          </div>
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
            <Label>Phone Number</Label>
            <Input
              type="text"
              value={input.phone}
              name="phone"
              onChange={changeEventHandler}
              placeholder="Optional, in +919876543210 format"
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
            <p className="text-xs text-gray-500 mt-1">At least 12 characters.</p>
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
          </div>
          {loading ? (
            <Button className="w-full my-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait
            </Button>
          ) : (
            <Button type="submit" className="w-full my-4">
              Sign Up
            </Button>
          )}
          <span className="text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-signal-text">
              Login
            </Link>
          </span>
        </form>
      </div>
    </div>
  );
};

export default Signup;
