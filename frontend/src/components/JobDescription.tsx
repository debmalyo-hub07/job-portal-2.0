import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { AppliedJobDto, JobDto, PaginatedResponse } from "@jobportal/shared";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setSingleJob } from "@/redux/jobSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

const JobDescription = () => {
  const { singleJob } = useAppSelector((state) => state.job);
  const { user } = useAppSelector((state) => state.auth);
  const params = useParams();
  const jobId = params.id;
  const dispatch = useAppDispatch();

  const [isApplied, setIsApplied] = useState(false);

  const applyJobHandler = async () => {
    try {
      // POST: applying creates an Application. It answered to a GET until 1C.
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/application/apply/${jobId}`,
      );
      if (res.data.success) {
        setIsApplied(true);
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not apply"));
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const fetchSingleJob = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; job: JobDto }>(`/job/get/${jobId}`);
        if (res.data.success) {
          dispatch(setSingleJob(res.data.job));
        }
      } catch (error) {
        console.error(error);
      }
    };
    void fetchSingleJob();
  }, [jobId, dispatch]);

  // Whether *this* seeker has applied, asked separately.
  //
  // This used to read `job.applications` from the response above, which meant
  // the public job endpoint had to ship every applicant of every job to anyone
  // who opened the page. The seeker-scoped endpoint answers the same question
  // about the caller alone. Recruiters and anonymous visitors skip it — there is
  // no Apply button for them to gate.
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
      .then((res) => {
        if (cancelled) return;
        setIsApplied(res.data.items.some((a) => a.job?.id === jobId));
      })
      .catch(() => {
        if (!cancelled) setIsApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, user?.portal, user?.id]);

  // Loading is a real state, not a blank frame: every field below reads from
  // `singleJob`, so rendering the shell before it arrives is what made the old
  // page pop its values in one by one.
  if (!singleJob) {
    return (
      <div>
        <div className="max-w-4xl mx-auto my-10 px-4 space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const posted = singleJob.createdAt ? singleJob.createdAt.split("T")[0] : "—";

  return (
    <div>
      <article className="max-w-4xl mx-auto my-10 px-4">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">{singleJob.title}</h1>
            <p className="text-ink-muted mt-1">{singleJob.company?.name}</p>
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <Badge className="text-signal-text font-bold" variant="ghost">
                {singleJob.position} Positions
              </Badge>
              <Badge className="text-signal-text font-bold" variant="ghost">
                {singleJob.jobType}
              </Badge>
              <Badge className="text-signal-text font-bold" variant="ghost">
                {singleJob.salary} LPA
              </Badge>
              {singleJob.remote && (
                <Badge className="text-signal-text font-bold" variant="ghost">
                  Remote
                </Badge>
              )}
            </div>
          </div>
          <Button
            onClick={isApplied ? undefined : applyJobHandler}
            disabled={isApplied}
            variant={isApplied ? "secondary" : "signal"}
            className="shrink-0"
          >
            {isApplied ? "Applied" : "Apply Now"}
          </Button>
        </header>

        <section className="mt-8" aria-labelledby="overview-heading">
          <h2 id="overview-heading" className="text-xl font-display border-b border-line pb-2">
            Overview
          </h2>
          {/* A description list, not headings: these are label/value pairs, and
              marking each label as <h1> is what gave the old page seven of them. */}
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-ink-muted">Location</dt>
              <dd>{singleJob.location}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-ink-muted">Experience</dt>
              <dd>{singleJob.experienceLevel} years</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-ink-muted">Salary</dt>
              <dd>{singleJob.salary} LPA</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-ink-muted">Posted</dt>
              <dd>{posted}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-8" aria-labelledby="role-heading">
          <h2 id="role-heading" className="text-xl font-display border-b border-line pb-2">
            About the role
          </h2>
          <p className="mt-4 whitespace-pre-line">{singleJob.description}</p>
          {singleJob.requirements.length > 0 && (
            <>
              <h3 className="text-xl font-display mt-6">What we're looking for</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {singleJob.requirements.map((skill) => (
                  <li key={skill}>
                    <Badge variant="outline">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </article>
    </div>
  );
};

export default JobDescription;
