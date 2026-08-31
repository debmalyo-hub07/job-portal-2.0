import { useEffect, useState } from "react";
import { Pen } from "lucide-react";
import { toast } from "sonner";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import PageShell from "./layout/PageShell";
import AppliedJobTable from "./AppliedJobTable";
import UpdateProfileDialog from "./UpdateProfileDialog";
import IdentityCard from "./identity/IdentityCard";
import { apiClient } from "@/lib/apiClient";
import { initialsOf } from "@/lib/initials";
import { Reveal } from "@/lib/motion";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useAppSelector } from "@/redux/store";

const Profile = () => {
  const [open, setOpen] = useState(false);
  const { bootstrapped } = useAppSelector((state) => state.auth);
  /**
   * Page data, held locally rather than in redux. `SessionUser` deliberately
   * carries no profile fields, and the profile is not session state — putting
   * it in the store would make every consumer of `state.auth.user` re-render
   * on a bio edit.
   */
  const [profile, setProfile] = useState<ProfileView | null>(null);
  /**
   * Tracked separately from `profile === null`, which cannot tell "still
   * fetching" from "the fetch failed". Without it the page rendered its own
   * chrome around empty strings and the fields popped in one at a time.
   */
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for /me: firing this before bootstrap races the refresh interceptor
    // for the same 401 and produces two refreshes on a cold load.
    if (!bootstrapped) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<ProfileResponse>("/user/profile")
      .then((res) => {
        if (!cancelled) setProfile(res.data.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped]);

  const skills = profile?.seeker?.skills ?? [];
  const resumeUrl = profile?.seeker?.resumeUrl;
  const fit = profile?.seeker;

  /**
   * The consented device location (P2). Distinct from the self-reported
   * "Preferred location" below: that is typed, this is detected with the
   * browser's permission, and only the city is ever saved.
   */
  const geo = useDeviceLocation();
  const storedGeo = profile?.seeker?.geoLocation ?? null;
  const [savingGeo, setSavingGeo] = useState(false);

  // Saves once per consented lookup, and only when it differs from what the
  // profile already holds. Runs off the granted state — nothing posts without
  // the "Use my location" button having been clicked first.
  useEffect(() => {
    if (geo.state !== "granted" || !geo.city || !geo.country) return;
    if (storedGeo?.city === geo.city && storedGeo.country === geo.country) return;
    let cancelled = false;
    setSavingGeo(true);
    const form = new FormData();
    form.set("geoLocation", JSON.stringify({ city: geo.city, country: geo.country }));
    apiClient
      .post("/user/profile/update", form)
      .then(() => {
        if (!cancelled && profile) {
          setProfile({
            ...profile,
            seeker: { ...profile.seeker!, geoLocation: { city: geo.city!, country: geo.country! } },
          });
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not save your area. Try again in a moment.");
      })
      .finally(() => {
        if (!cancelled) setSavingGeo(false);
      });
    return () => {
      cancelled = true;
    };
    // The stored primitives, not the profile object: the save must not re-fire
    // on every unrelated profile state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.state, geo.city, geo.country, storedGeo?.city, storedGeo?.country]);

  /**
   * One bound set and not the other is a real state — `salaryFit` reads a lone
   * floor as "at least this" — so it is rendered as such rather than collapsed
   * into "Not set".
   */
  const salaryBand =
    fit?.salaryMin !== null && fit?.salaryMin !== undefined
      ? fit.salaryMax !== null && fit.salaryMax !== undefined
        ? `${fit.salaryMin}–${fit.salaryMax} LPA`
        : `${fit.salaryMin} LPA and up`
      : fit?.salaryMax !== null && fit?.salaryMax !== undefined
        ? `Up to ${fit.salaryMax} LPA`
        : "Not set";

  /**
   * `null` is "no preference", which `remoteFit` treats as no penalty — not the
   * same answer as "prefer on-site", which scores a remote role at 0.
   */
  const remoteLabel =
    fit?.openToRemote === null || fit?.openToRemote === undefined
      ? "No preference"
      : fit.openToRemote
        ? "Open to remote"
        : "Prefer on-site";

  if (loading || !bootstrapped) {
    return (
      <>
        <PageShell density="compact" motion="response">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="size-24 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-5 w-64" />
              </div>
            </div>
            <Skeleton className="h-32 w-full rounded-surface" />
          </div>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <PageShell density="compact" motion="response">
        <section className="rounded-surface border border-line bg-paper-raised p-(--space-card)">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-24">
                <AvatarImage src={profile?.user.avatarUrl ?? undefined} alt="" />
                {/*
                  The fallback the navbar has had since 2B-1 and this page did
                  not. `avatarUrl` is null for every account created through the
                  standard flow, so without it the header showed an empty ring.
                */}
                <AvatarFallback className="text-xl">
                  {initialsOf(profile?.user.fullName ?? "")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="font-display text-display-sm font-semibold text-ink">
                  {profile?.user.fullName ?? "Your profile"}
                </h1>
                {profile?.seeker?.bio ? (
                  <p className="mt-1 max-w-prose text-ink-muted">{profile.seeker.bio}</p>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">No bio yet.</p>
                )}
              </div>
            </div>
            <Button onClick={() => setOpen(true)} variant="outline" size="icon" className="shrink-0">
              <Pen />
              <span className="sr-only">Edit profile</span>
            </Button>
          </div>

          {/* One component for all three portals' identity block, so date of
              birth is formatted in UTC in exactly one place. */}
          <div className="mt-(--space-card)">
            {profile ? <IdentityCard profile={profile} /> : null}
          </div>

          <div className="mt-(--space-card)">
            <h2 className="font-display text-xl font-semibold text-ink">Skills</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {skills.length > 0 ? (
                skills.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-ink-muted">
                  No skills listed yet — add a few so roles can match you.
                </p>
              )}
            </div>
          </div>

          <div className="mt-(--space-card)">
            <h2 className="font-display text-xl font-semibold text-ink">Matching preferences</h2>
            {/*
              The read side of the five fields `UpdateProfileDialog` writes and
              `toFitSeekerInput` scores on. Offering a form for them and then
              showing none of them back leaves the person who filled it in with
              no way to check what they stored — they land on a job whose fit
              badge says their salary band cost it points, and cannot see the
              band. An unset field is named as *not counting*, which is the
              opposite of scoring zero and the distinction the pipeline makes.
            */}
            <p className="mt-1 text-sm text-ink-muted">
              What each job&apos;s fit is worked out from. Anything you leave unset simply stops
              counting against a role.
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-muted">Experience</dt>
                <dd className="text-ink">
                  {fit?.experienceYears === null || fit?.experienceYears === undefined
                    ? "Not set"
                    : `${fit.experienceYears} years`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Preferred location</dt>
                <dd className="text-ink">{fit?.location || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Salary expectation</dt>
                <dd className="text-ink">{salaryBand}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Remote work</dt>
                <dd className="text-ink">{remoteLabel}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-(--space-card)" data-testid="profile-location">
            <h2 className="font-display text-xl font-semibold text-ink">Your area</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Detected with your browser&apos;s permission when you ask for it. Only the city is
              saved — never your precise position.
            </p>
            <div className="mt-3">
              {geo.city && geo.country ? (
                <p className="text-ink">
                  {geo.city}, {geo.country}
                  {savingGeo ? <span className="ml-2 text-sm text-ink-muted">saving…</span> : null}
                </p>
              ) : storedGeo ? (
                <p className="text-ink">
                  {storedGeo.city}, {storedGeo.country}
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={geo.locate}
                  disabled={geo.state === "locating"}
                >
                  {geo.state === "locating" ? "Locating…" : "Use my location"}
                </Button>
              )}
              {geo.state === "denied" ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Your browser said no. You can allow location for this site in its settings and
                  try again.
                </p>
              ) : null}
              {geo.state === "failed" ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Could not detect your area just now. Try again in a moment.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-(--space-card)">
            <h2 className="font-display text-xl font-semibold text-ink">Resume</h2>
            {/* Previously gated on a hardcoded `const isResume = true`, so the
                link rendered even when no resume existed. */}
            {resumeUrl ? (
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={resumeUrl}
                className="mt-2 inline-block rounded-sharp text-signal-text hover:underline focus-visible:ring-[3px] focus-visible:ring-signal-ring focus-visible:outline-none"
              >
                {profile?.seeker?.resumeName ?? "Download resume"}
              </a>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No resume uploaded.</p>
            )}
          </div>
        </section>

        <Reveal className="mt-(--space-section)">
          <section>
            <h2 className="font-display text-display-sm font-semibold text-ink">Applied jobs</h2>
            <div className="mt-(--space-card)">
              <AppliedJobTable />
            </div>
          </section>
        </Reveal>

        <UpdateProfileDialog
          open={open}
          setOpen={setOpen}
          profile={profile}
          onUpdated={setProfile}
        />
      </PageShell>
    </>
  );
};

export default Profile;
