import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { LogOut, User2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { clearPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Up to two initials from a display name.
 *
 * The avatar trigger needs content that survives a null avatarUrl — which is
 * every account created through the standard flow, since nothing uploads a
 * picture at registration. Without a fallback the trigger is a zero-content
 * circle and the sign-out inside it cannot be reached.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

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

  const isRecruiter = user?.portal === "recruiter";

  return (
    <div className="border-b border-line bg-paper">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to={isRecruiter ? "/hire" : "/"}>
          <h1 className="font-display text-2xl font-bold text-ink">
            Job<span className="text-signal-text">{isRecruiter ? "Hire" : "Portal"}</span>
          </h1>
        </Link>

        <div className="flex items-center gap-8">
          <ul className="flex items-center gap-5 text-sm font-medium">
            {isRecruiter ? (
              <>
                <li>
                  <Link to="/admin/companies" className="hover:text-signal-text">
                    Companies
                  </Link>
                </li>
                <li>
                  <Link to="/admin/jobs" className="hover:text-signal-text">
                    Jobs
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/" className="hover:text-signal-text">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/jobs" className="hover:text-signal-text">
                    Jobs
                  </Link>
                </li>
                <li>
                  <Link to="/browse" className="hover:text-signal-text">
                    Browse
                  </Link>
                </li>
              </>
            )}
          </ul>

          <ThemeToggle />

          {!user ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="signal">
                <Link to="/signup">Get started</Link>
              </Button>
            </div>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring"
                >
                  <Avatar className="cursor-pointer">
                    {/* alt="" because the button already carries the accessible
                        name; a duplicated name is announced twice. */}
                    <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{initialsOf(user.fullName)}</AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{initialsOf(user.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{user.fullName}</p>
                    {/* SessionUser has no bio by design, and the email is the
                        more useful identifier in a session popover anyway. */}
                    <p className="truncate text-sm text-ink-muted">{user.email}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3">
                  {!isRecruiter && (
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 rounded-sharp px-2 py-1.5 text-sm text-ink hover:bg-signal-muted"
                    >
                      <User2 className="size-4" />
                      View profile
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={logoutHandler}
                    className="flex items-center gap-2 rounded-sharp px-2 py-1.5 text-left text-sm text-ink hover:bg-signal-muted"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
