import { useEffect, useState } from "react";
import { Contact, Mail, Pen } from "lucide-react";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import PageShell from "./layout/PageShell";
import AppliedJobTable from "./AppliedJobTable";
import UpdateProfileDialog from "./UpdateProfileDialog";
import useGetAppliedJobs from "@/hooks/useGetAppliedJobs";
import { apiClient } from "@/lib/apiClient";
import { initialsOf } from "@/lib/initials";
import { useAppSelector } from "@/redux/store";

const Profile = () => {
  useGetAppliedJobs();
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

          <dl className="mt-(--space-card) grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <Mail className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <dt className="sr-only">Email</dt>
              <dd className="truncate text-ink">{profile?.user.email ?? "—"}</dd>
            </div>
            <div className="flex items-center gap-3">
              <Contact className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <dt className="sr-only">Phone</dt>
              <dd className="truncate text-ink">{profile?.phone ?? "Not provided"}</dd>
            </div>
          </dl>

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
            <h2 className="font-display text-xl font-semibold text-ink">Resume</h2>
            {/* Previously gated on a hardcoded `const isResume = true`, so the
                link rendered even when no resume existed. */}
            {resumeUrl ? (
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={resumeUrl}
                className="mt-2 inline-block text-signal-text hover:underline"
              >
                {profile?.seeker?.resumeName ?? "Download resume"}
              </a>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No resume uploaded.</p>
            )}
          </div>
        </section>

        <section className="mt-(--space-section)">
          <h2 className="font-display text-display-sm font-semibold text-ink">Applied jobs</h2>
          <div className="mt-(--space-card)">
            <AppliedJobTable />
          </div>
        </section>

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
