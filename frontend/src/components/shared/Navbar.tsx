import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Avatar, AvatarImage } from "../ui/avatar";
import { LogOut, User2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { clearPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const Navbar = () => {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const logoutHandler = async () => {
    if (!user) return;
    try {
      // The portal comes from `user`, not the hint: the hint is for when there
      // is no user. The interceptor attaches the CSRF header.
      await apiClient.post(`/${user.portal}/auth/logout`);
      toast.success("Logged out.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Logout failed"));
    } finally {
      // Local state is cleared either way. A logout that failed server-side is
      // still a user who asked to be signed out, and leaving them looking
      // signed in is the worse of the two wrong answers.
      clearPortalHint();
      dispatch(setUser(null));
      navigate("/");
    }
  };

  return (
    <div className="bg-paper border-b border-line">
      <div className="flex items-center justify-between mx-auto max-w-7xl h-16">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Job<span className="text-signal-text">Portal</span>
          </h1>
        </div>
        <div className="flex items-center gap-12">
          <ul className="flex font-medium items-center gap-5">
            {user && user.portal === "recruiter" ? (
              <>
                <li>
                  <Link to="/admin/companies">Companies</Link>
                </li>
                <li>
                  <Link to="/admin/jobs">Jobs</Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/">Home</Link>
                </li>
                <li>
                  <Link to="/jobs">Jobs</Link>
                </li>
                <li>
                  <Link to="/browse">Browse</Link>
                </li>
              </>
            )}
          </ul>
          <ThemeToggle />
          {!user ? (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="outline">Login</Button>
              </Link>
              <Link to="/signup">
                <Button variant="signal">Signup</Button>
              </Link>
            </div>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Avatar className="cursor-pointer">
                  {/* `?? undefined` because avatarUrl is `string | null` and
                      AvatarImage's src is `string | undefined`. */}
                  <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.fullName} />
                </Avatar>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div>
                  <div className="flex gap-2 space-y-2">
                    <Avatar className="cursor-pointer">
                      <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.fullName} />
                    </Avatar>
                    <div>
                      <h4 className="font-medium">{user?.fullName}</h4>
                      {/* SessionUser has no bio by design, and the email is the
                          more useful identifier in a session popover anyway. */}
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col my-2 text-gray-600">
                    {user && user.portal === "seeker" && (
                      <div className="flex w-fit items-center gap-2 cursor-pointer">
                        <User2 />
                        <Button variant="link">
                          <Link to="/profile">View Profile</Link>
                        </Button>
                      </div>
                    )}

                    <div className="flex w-fit items-center gap-2 cursor-pointer">
                      <LogOut />
                      <Button onClick={logoutHandler} variant="link">
                        Logout
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
