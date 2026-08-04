import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../shared/Navbar";

const MESSAGES: Record<string, string> = {
  GOOGLE_AUTH_FAILED: "Google sign-in could not be completed.",
  GOOGLE_LINK_INVALID: "That confirmation link is invalid or has expired.",
};

const AuthError = () => {
  const [params] = useSearchParams();
  // The *mapped* string only. The raw parameter is attacker-controlled text on
  // a page of ours, and rendering it turns a bookmarkable URL into a way to put
  // arbitrary words in our own voice.
  const message =
    MESSAGES[params.get("code") ?? ""] ?? "Something went wrong while signing you in.";

  return (
    <div>
      <Navbar />
      <div className="flex items-center justify-center max-w-7xl mx-auto">
        <div className="w-1/2 border border-gray-200 rounded-md p-4 my-10">
          <h1 className="font-bold text-xl mb-2">Sign-in failed</h1>
          <p className="text-sm text-gray-600">{message}</p>
          <Link to="/login" className="text-sm text-blue-600 mt-4 inline-block">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthError;
