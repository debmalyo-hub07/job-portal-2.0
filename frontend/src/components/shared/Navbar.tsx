import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { LogOut, Menu, User2 } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import { navLinksFor } from "./navLinks";
import { Wordmark } from "./Wordmark";

import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { initialsOf } from "@/lib/initials";
import { setUser } from "@/redux/authSlice";
import { clearPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const Navbar = () => {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

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
      setCsrfToken(null);
      dispatch(setUser(null));
      navigate("/");
    }
  };

  const isRecruiter = user?.portal === "recruiter";
  const links = navLinksFor(user?.portal ?? "seeker");

  return (
    <div className="border-b border-line bg-paper">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Wordmark
          portal={user?.portal ?? "seeker"}
          to={isRecruiter ? "/hire" : "/"}
          className="text-2xl"
        />

        <div className="flex items-center gap-4 lg:gap-8">
          {/* Desktop links. Below lg they live in the sheet instead — at the
              narrow end the row collided with the avatar and the theme toggle. */}
          <ul className="hidden items-center gap-5 text-sm font-medium lg:flex">
            {links.map((link) => (
              <li key={link.to}>
                {/*
                  NavLink, not Link: the current page needs to say so. The
                  underline is the visible half and `aria-current="page"` is the
                  half a screen reader hears — colour alone would be neither
                  accessible nor visible in a monochrome render.

                  `end` so "/" is only current at the root. Without it the seeker
                  home link matches every path in the application, which is the
                  usual way this lands wrong.
                */}
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    isActive
                      ? "text-signal-text underline decoration-2 underline-offset-8"
                      : "hover:text-signal-text"
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <ThemeToggle />

          {!user ? (
            /* "Sign in" hides below sm; "Get started" always shows. Both at
               360px left no room for the logo, and of the two the primary
               action is the one worth keeping. Sign-in stays reachable from
               the sheet. */
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="hidden sm:inline-flex">
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

          {/* Mobile navigation. `Sheet` shipped in 2A and was used by nothing
              until now, which is why the app had no navigation at all below lg. */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1 px-4">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `rounded-sharp px-2 py-2 text-base hover:bg-signal-muted ${
                        isActive ? "text-signal-text" : "text-ink"
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
                {!user && (
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-sharp px-2 py-2 text-base text-ink hover:bg-signal-muted sm:hidden"
                  >
                    Sign in
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
