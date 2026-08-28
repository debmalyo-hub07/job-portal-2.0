import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, BriefcaseBusiness, CalendarDays, CircleSlash, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { AppliedJobDto, JobDto, PaginatedResponse } from "@jobportal/shared";

import CompanyAvatar from "./shared/CompanyAvatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { FitBreakdown } from "./FitBadge";
import PageShell from "./layout/PageShell";
import { Reveal } from "@/lib/motion";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { initialsOf } from "@/lib/initials";
import { setSingleJob } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { userForPortal } from "@/redux/authSlice";
import { completePathFor } from "@/lib/portalHome";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const JobDescription = () => {
  const { singleJob } = useAppSelector((state) => state.job);
  const user = useAppSelector((state) => userForPortal(state.auth, "seeker"));
  const { id: jobId } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [isApplied, setIsApplied] = useState(false);

  const applyJobHandler = async () => {
    if (!user) {
      navigate("/login", {
        state: { from: `${location.pathname}${location.search}${location.hash}` },
      });
      return;
    }    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        `/application/apply/${jobId}`,
      );
      if (response.data.success) {
        setIsApplied(true);
        toast.success(response.data.message);
      }
    } catch (error) {
      // The gate's client half cannot cover this button: `/description/:id` is a
      // PUBLIC page, so an incomplete seeker arrives here without ever passing
      // `RequireProfileComplete`. Same shape as Login's EMAIL_NOT_VERIFIED branch
      // — route them to the fix rather than showing a dead-end toast.
      //
      // The only call site that needs this. Every recruiter write lives inside the
      // guarded workspace, and applying is the one consequential action reachable
      // from a public route.
      if (getApiErrorCode(error) === "PROFILE_INCOMPLETE") {
        toast.error("Add your date of birth to apply.");
        navigate(completePathFor("seeker"), {
          state: { from: `${location.pathname}${location.search}${location.hash}` },
        });
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not apply"));
    }
  };

  useEffect(() => {
    if (!jobId) return;
    apiClient
      .get<{ success: boolean; job: JobDto }>(`/job/get/${jobId}`)
      .then((response) => {
        if (response.data.success) dispatch(setSingleJob(response.data.job));
      })
      .catch((error) => console.error(error));
  }, [jobId, dispatch]);

  useEffect(() => {
    if (!jobId || user?.portal !== "seeker") {
      setIsApplied(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get<{ success: boolean } & PaginatedResponse<AppliedJobDto>>("/application/get", {
        params: { limit: 50 },
      })
      .then((response) => {
        if (!cancelled) setIsApplied(response.data.items.some((application) => application.job?.id === jobId));
      })
      .catch(() => {
        if (!cancelled) setIsApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, user?.id, user?.portal]);

  if (!singleJob) {
    return (
      <PageShell width="wide" motion="standard">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-4/5" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-80 rounded-surface" />
        </div>
      </PageShell>
    );
  }

  const posted = singleJob.createdAt
    ? dateFormatter.format(new Date(singleJob.createdAt))
    : "Recently";
  // `?? "open"` for the same reason the API filters on `$ne "closed"`: a job row
  // written before the field existed carries no status, and it is open.
  const closed = (singleJob.status ?? "open") === "closed";
  // Project C: a signed-in minor sees the internship-only rule on the button
  // rather than discovering it on submit. Advisory only — the server check is
  // the enforcement, the same arrangement as the closed-role block below.
  const minorBlocked =
    user?.portal === "seeker" && user.isMinor && singleJob.jobType !== "Internship";

  return (
    <PageShell width="wide" motion="standard" className="pt-8">
      <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to roles
      </Link>

      <article className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0">
          <header className="border-b border-line pb-8">
            <div className="flex items-center gap-3">
              <CompanyAvatar name={singleJob.company?.name} logoUrl={singleJob.company?.logoUrl} className="size-11" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{singleJob.company?.name}</p>
                <p className="mt-0.5 text-xs text-ink-muted">Posted {posted}</p>
              </div>
            </div>

            <h1 className="mt-7 max-w-4xl font-display text-4xl font-semibold leading-[0.98] text-balance text-ink sm:text-6xl lg:text-[5rem]">
              {singleJob.title}
            </h1>

            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="outline">{singleJob.department}</Badge>
              <Badge variant="secondary"><BriefcaseBusiness aria-hidden="true" />{singleJob.jobType}</Badge>
              <Badge variant="outline">{singleJob.position}</Badge>
              {singleJob.remote ? <Badge variant="signal">Remote</Badge> : null}
            </div>
          </header>

          {singleJob.fit ? (
            <Reveal className="mt-7">
              <FitBreakdown fit={singleJob.fit} />
            </Reveal>
          ) : null}

          <Reveal className="mt-9" delay={0.05}>
            <section aria-labelledby="role-heading">
              <h2 id="role-heading" className="font-display text-display-sm font-semibold text-ink">About the role</h2>
              <p className="mt-5 whitespace-pre-line text-base leading-8 text-ink-muted">{singleJob.description}</p>
            </section>
          </Reveal>

          {singleJob.requirements.length > 0 ? (
            <Reveal className="mt-10 border-t border-line pt-8" delay={0.1}>
              <section aria-labelledby="requirements-heading">
                <h2 id="requirements-heading" className="font-display text-display-sm font-semibold text-ink">What the team is looking for</h2>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {singleJob.requirements.map((skill) => (
                    <li key={skill}><Badge variant="outline">{skill}</Badge></li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ) : null}
        </div>

        <aside className="rounded-surface border border-line bg-paper-raised p-5 shadow-[var(--elevate-1)] lg:sticky lg:top-24">
          {/*
            A closed role is still reachable by URL — a candidate who applied has
            this link in their applied-jobs list, so 404ing it would break their
            own record. What changes is the control: the API answers 409
            JOB_CLOSED, and a live Apply button that can only fail is worse than
            no button. The applied state still wins, because "you applied to this"
            is the more useful thing to know about a role that has since closed.
          */}
          {closed && !isApplied ? (
            <div className="rounded-surface border border-line-strong bg-paper-sunken p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CircleSlash aria-hidden="true" className="size-4 shrink-0" />
                This role is closed
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                The team has stopped accepting applications. Browse open roles instead.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link to="/jobs">See open roles</Link>
              </Button>
            </div>
          ) : minorBlocked ? (
            <div className="rounded-surface border border-line-strong bg-paper-sunken p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CircleSlash aria-hidden="true" className="size-4 shrink-0" />
                Internships only
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Candidates under 18 can apply to internship roles only. This one is{" "}
                {singleJob.jobType.toLowerCase()}.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link to="/jobs?jobType=Internship">See internship roles</Link>
              </Button>
            </div>
          ) : (
            <Button
              onClick={isApplied ? undefined : applyJobHandler}
              disabled={isApplied}
              variant={isApplied ? "secondary" : "signal"}
              size="lg"
              className="w-full"
            >
              {isApplied ? "Application sent" : "Apply for this role"}
            </Button>
          )}

          <dl className="mt-6 divide-y divide-line border-t border-line">
            <div className="flex gap-3 py-4">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div><dt className="text-xs text-ink-muted">Location</dt><dd className="mt-1 text-sm font-medium text-ink">{singleJob.remote ? "Remote" : singleJob.location}</dd></div>
            </div>
            <div className="flex gap-3 py-4">
              <BriefcaseBusiness aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div><dt className="text-xs text-ink-muted">Experience</dt><dd className="mt-1 text-sm font-medium text-ink">{singleJob.experienceLevel} years</dd></div>
            </div>
            <div className="flex gap-3 py-4">
              <Banknote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div><dt className="text-xs text-ink-muted">Compensation</dt><dd className="mt-1 text-sm font-medium text-ink">INR {singleJob.salary} LPA</dd></div>
            </div>
            <div className="flex gap-3 py-4">
              <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div><dt className="text-xs text-ink-muted">Posted</dt><dd className="mt-1 text-sm font-medium text-ink">{posted}</dd></div>
            </div>
          </dl>

          {/*
            Posted by. `postedBy` is null when the owning recruiter no longer
            exists — the seeded catalogue's listings are owner-less by design —
            so the whole block is absent rather than rendering an empty person.

            `email` arrives only for an authenticated seeker: the API withholds
            contact details from a public response, so its absence is the signal
            to explain the gate rather than a field that failed to load.
          */}
          {singleJob.postedBy ? (
            <section aria-labelledby="posted-by-heading" className="mt-6 border-t border-line pt-5">
              <h2 id="posted-by-heading" className="text-xs text-ink-muted">
                Posted by
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback>{initialsOf(singleJob.postedBy.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {singleJob.postedBy.fullName}
                  </p>
                  {singleJob.postedBy.designation ? (
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {singleJob.postedBy.designation}
                    </p>
                  ) : null}
                </div>
              </div>

              {singleJob.postedBy.email ? (
                <ul className="mt-4 grid gap-2">
                  <li className="flex items-center gap-2">
                    <Mail aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                    <a
                      href={`mailto:${singleJob.postedBy.email}`}
                      className="truncate text-sm text-signal-text hover:underline"
                    >
                      {singleJob.postedBy.email}
                    </a>
                  </li>
                  {singleJob.postedBy.phone ? (
                    <li className="flex items-center gap-2">
                      <Phone aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                      <a
                        href={`tel:${singleJob.postedBy.phone}`}
                        className="text-sm text-signal-text hover:underline"
                      >
                        {singleJob.postedBy.phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-muted">
                  <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>Sign in as a candidate to see contact details.</span>
                </p>
              )}
            </section>
          ) : null}
        </aside>
      </article>
    </PageShell>
  );
};

export default JobDescription;
