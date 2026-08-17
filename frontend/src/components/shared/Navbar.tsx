import { useEffect, useState } from "react";
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
import { BriefcaseBusiness, LogOut, Menu, User2, UserPlus } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { navLinksFor } from "./navLinks";
import { Wordmark } from "./Wordmark";

import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { initialsOf } from "@/lib/initials";
import { clearPortalSession, userForPortal } from "@/redux/authSlice";
import { clearPortalHint } from "@/lib/portal";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";
import { landingPathFor, loginPathFor } from "@/lib/portalHome";
import { portalForPath } from "@/lib/portalRoutes";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";

const Navbar = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routePortal = portalForPath(pathname);
  useAuthBootstrap(routePortal);
  const user = useAppSelector((state) => userForPortal(state.auth, routePortal));
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isHeroRoute = pathname === "/" || pathname === "/hire";

  useEffect(() => {
    if (!isHeroRoute) {
      setScrolled(false);
      return;
    }

    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [isHeroRoute]);

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
      clearPortalHint(user.portal);
      setCsrfToken(user.portal, null);
      dispatch(clearPortalSession(user.portal));
      navigate(user.portal === "seeker" ? "/" : loginPathFor(user.portal));
    }
  };

  const isRecruiter = user?.portal === "recruiter";
  const isPublicRecruiter = !user && (pathname === "/hire" || pathname.startsWith("/hire/"));
  const navbarPortal = user?.portal ?? (isPublicRecruiter ? "recruiter" : "seeker");
  const mediaTone = isHeroRoute && !scrolled;
  const publicLogin = isPublicRecruiter ? "/hire/login" : "/login";
  const publicSignup = isPublicRecruiter ? "/hire/signup" : "/signup";
  const links = navLinksFor(user?.portal ?? navbarPortal, user ? "session" : "public");
  const showDesktopLinks = !user || user.portal === "seeker";

  return (
    <header
      className={cn(
        "top-0 z-40 w-full border-b transition-[background-color,border-color,box-shadow] duration-(--dur-base) backdrop-blur-xl",
        isHeroRoute ? "fixed inset-x-0" : "sticky",
        mediaTone
          ? "navbar-hero border-transparent bg-transparent shadow-none"
          : "border-line bg-paper/95 shadow-[0_0.5rem_2rem_color-mix(in_oklab,var(--shade)_8%,transparent)]",
      )}
    >
      <nav className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
        <Wordmark
          portal={navbarPortal}
          to={user ? landingPathFor(user.portal) : isRecruiter || isPublicRecruiter ? "/hire" : "/"}
          className="text-[1.65rem]"
          tone={mediaTone ? "media" : "default"}
        />

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:gap-5">
          {/* Desktop links. Below lg they live in the sheet instead — at the
              narrow end the row collided with the avatar and the theme toggle. */}
          <ul className={showDesktopLinks ? "hidden items-center gap-1 text-sm font-medium lg:flex" : "hidden"}>
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
                      ? cn(
                          "rounded-sharp px-3 py-2",
                          mediaTone ? "bg-media-copy/12 text-media-copy" : "bg-paper-sunken text-ink",
                        )
                      : cn(
                          "rounded-sharp px-3 py-2",
                          mediaTone
                            ? "text-media-copy/75 hover:bg-media-copy/10 hover:text-media-copy"
                            : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
                        )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <ThemeToggle
            className={mediaTone ? "text-media-copy hover:bg-media-copy/10 hover:text-media-copy" : undefined}
          />

          {!user ? (
            /* "Sign in" hides below sm; "Get started" always shows. Both at
               360px left no room for the logo, and of the two the primary
               action is the one worth keeping. Sign-in stays reachable from
               the sheet. */
            <div className="flex min-w-0 items-center gap-2">
              <Button
                asChild
                variant="ghost"
                className={cn(
                  "hidden sm:inline-flex",
                  mediaTone && "text-media-copy hover:bg-media-copy/10 hover:text-media-copy",
                )}
              >
                <Link to={publicLogin}>Sign in</Link>
              </Button>
              <Button
                asChild
                variant="signal"
                className="shrink-0 max-[430px]:size-10 max-[430px]:px-0"
              >
                <Link
                  to={publicSignup}
                  aria-label={isPublicRecruiter ? "Post a role" : "Get started"}
                >
                  {isPublicRecruiter ? (
                    <BriefcaseBusiness data-icon="inline-start" />
                  ) : (
                    <UserPlus data-icon="inline-start" />
                  )}
                  <span className="max-[430px]:sr-only">
                    {isPublicRecruiter ? "Post a role" : "Get started"}
                  </span>
                </Link>
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
                  {user.portal === "seeker" && (
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
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "lg:hidden",
                  mediaTone && "border-media-copy/35 bg-media-shade/15 text-media-copy hover:bg-media-copy/10 hover:text-media-copy",
                )}
                aria-label="Open menu"
              >
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
                    to={publicLogin}
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
    </header>
  );
};

export default Navbar;
