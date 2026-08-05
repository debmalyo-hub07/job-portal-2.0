import { Link } from "react-router-dom";
import Navbar from "../shared/Navbar";

/**
 * The step-up branch: a Google identity arrived for an address that already has
 * a password account, so linking needs proof of the mailbox. There is
 * deliberately nothing to submit here — the whole point is that the browser
 * cannot complete this step.
 */
const LinkPending = () => (
  <div>
    <Navbar />
    <div className="flex items-center justify-center max-w-7xl mx-auto">
      <div className="w-1/2 border border-gray-200 rounded-md p-4 my-10">
        <h1 className="font-bold text-xl mb-2">Check your email</h1>
        <p className="text-sm text-gray-600">
          An account already exists for that address. We have sent a confirmation
          link to it — open the link to connect your Google sign-in. Until then
          nothing has changed, and you can still sign in with your password.
        </p>
        <Link to="/login" className="text-sm text-signal-text mt-4 inline-block">
          Back to login
        </Link>
      </div>
    </div>
  </div>
);

export default LinkPending;
