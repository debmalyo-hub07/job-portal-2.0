import type { HydratedDocument } from "mongoose";
import type {
  ApplicantDto,
  ApplicationEventDto,
  ApplicationStatus,
  AppliedJobDto,
  PaginatedResponse,
  PaginationQuery,
} from "@jobportal/shared";
import { notifiesSeeker, transitionRefusal } from "@jobportal/shared";
import { Application, type ApplicationDocument } from "../models/application.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import { AppError } from "../lib/AppError.js";
import { assertJobOpen, getOwnedJob, toJobDto } from "./job.service.js";
import { scoreSeekerForJob } from "./matching.pipeline.js";
import { signedResumeUrl } from "./resume.service.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import {
  renderApplicationStatusEmail,
  renderApplicationWithdrawnEmail,
} from "../lib/emailTemplates.js";
import { Seeker } from "../models/seeker.model.js";
import { Recruiter } from "../models/recruiter.model.js";
import { Job } from "../models/job.model.js";
import { Company } from "../models/company.model.js";

/** Mongo's duplicate-key error, whatever driver version raised it. */
function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

export async function applyToJob(seekerId: string, jobId: string): Promise<void> {
  // Existence *and* still open. A closed role that kept accepting applications
  // was the other half of the missing lifecycle: the recruiter had filled the
  // job and candidates went on applying to it.
  await assertJobOpen(jobId);
  try {
    // The first history entry is written here rather than derived later: a
    // timeline that starts at the first *decision* would show an application
    // appearing out of nowhere already shortlisted.
    await Application.create({
      job: jobId,
      applicant: seekerId,
      status: "applied",
      history: [{ status: "applied", at: new Date(), byPortal: "seeker" }],
    });
  } catch (err) {
    // The unique {job, applicant} index is the dedupe. A findOne pre-read would
    // let two parallel applies both pass the check and both insert.
    if (isDuplicateKey(err)) {
      throw AppError.conflict("ALREADY_APPLIED", "You have already applied for this job");
    }
    throw err;
  }
}

type PopulatedApplication = HydratedDocument<ApplicationDocument> & {
  createdAt?: Date;
};

/**
 * Oldest first, so the client renders a timeline in reading order without
 * re-sorting. Mongo preserves insertion order in an array and the service only
 * ever pushes, so this is a projection rather than a sort.
 */
function toHistoryDtos(history: ApplicationDocument["history"]): ApplicationEventDto[] {
  return (history ?? []).map((e) => ({
    status: e.status as ApplicationStatus,
    at: e.at.toISOString(),
    byPortal: e.byPortal as ApplicationEventDto["byPortal"],
  }));
}

export async function listAppliedJobs(
  seekerId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<AppliedJobDto>> {
  const filter = { applicant: seekerId };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "job", populate: { path: "company" } }),
  ]);
  return {
    items: (applications as PopulatedApplication[]).map((a) => ({
      id: String(a._id),
      status: a.status as AppliedJobDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      history: toHistoryDtos(a.history),
      // Null when the job was deleted after the application was filed.
      job:
        a.job && typeof a.job === "object" && "title" in a.job
          ? toJobDto(a.job as never)
          : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

type PopulatedApplicant = Omit<PopulatedApplication, "applicant"> & {
  applicant: HydratedDocument<SeekerDocument> | null;
};

export async function listApplicants(
  recruiterId: string,
  jobId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<ApplicantDto>> {
  // The document is both the ownership check and the right-hand side of every
  // reverse fit score. Looking it up again per applicant would be an N+1 read.
  const job = await getOwnedJob(recruiterId, jobId);
  const filter = { job: jobId };
  const applications = await Application.find(filter)
    .sort({ createdAt: -1 })
    // Projected at the query, not trimmed afterwards: the seeker record holds
    // far more than a recruiter is entitled to see. The full `profile` object is
    // needed internally for scoring, but only its established DTO fields leave.
    .populate({ path: "applicant", select: "fullName email phone profile resume" });

  const ranked = (applications as unknown as PopulatedApplicant[])
    .map((application) => ({
      application,
      fit: application.applicant ? scoreSeekerForJob(application.applicant, job) : null,
    }))
    .sort((a, b) => {
      const scoreDelta = (b.fit?.score ?? -1) - (a.fit?.score ?? -1);
      if (scoreDelta !== 0) return scoreDelta;

      // Stable, useful tie-breakers: newer applications first, then id so two
      // rows created in the same millisecond cannot swap between requests.
      const dateDelta =
        (b.application.createdAt?.getTime() ?? 0) -
        (a.application.createdAt?.getTime() ?? 0);
      if (dateDelta !== 0) return dateDelta;
      return String(a.application._id).localeCompare(String(b.application._id));
    });

  const total = ranked.length;
  const pageItems = ranked.slice((page - 1) * limit, page * limit);
  return {
    items: pageItems.map(({ application: a, fit }) => ({
      applicationId: String(a._id),
      status: a.status as ApplicantDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      fullName: a.applicant?.fullName ?? "",
      email: a.applicant?.email ?? "",
      phone: a.applicant?.phone ?? null,
      headline: a.applicant?.profile?.headline ?? null,
      skills: a.applicant?.profile?.skills ?? [],
      resumeUrl: signedResumeUrl(a.applicant?.resume?.storageKey),
      resumeName: a.applicant?.resume?.originalName ?? null,
      fit,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

const applicationNotFound = () =>
  AppError.notFound("APPLICATION_NOT_FOUND", "Application not found");

/**
 * Turns a refusal from the shared state machine into the right HTTP answer.
 *
 * A terminal application and a repeated status are both conflicts — the caller
 * asked for something that cannot happen given current state. A portal reaching
 * for another portal's transition is a permission problem, not a state one, and
 * must not be reported as a conflict or it reads as retryable.
 */
function refusalToError(refusal: NonNullable<ReturnType<typeof transitionRefusal>>): AppError {
  switch (refusal) {
    case "TERMINAL":
      return AppError.conflict(
        "APPLICATION_CLOSED",
        "This application is closed and its status can no longer change",
      );
    case "SAME_STATUS":
      return AppError.conflict("STATUS_UNCHANGED", "The application already has that status");
    case "NOT_ALLOWED_FOR_PORTAL":
      return AppError.forbidden("STATUS_NOT_ALLOWED", "That status cannot be set from this portal");
  }
}

/**
 * Applies a transition, records it, and notifies — in that order.
 *
 * The write is committed before any mail is dispatched. `dispatch` is
 * fire-and-forget by design, so a provider outage must not be able to roll back
 * or block a decision the recruiter already made.
 */
async function transition(
  application: HydratedDocument<ApplicationDocument>,
  to: ApplicationStatus,
  actor: "recruiter" | "seeker",
): Promise<ApplicationStatus> {
  const from = application.status as ApplicationStatus;
  const refusal = transitionRefusal(from, to, actor);
  if (refusal) throw refusalToError(refusal);

  const at = new Date();
  application.status = to;
  application.history.push({ status: to, at, byPortal: actor });
  // Terminal stages close the application; the active ones leave it live, and a
  // move back into an active stage from another active stage never sets this.
  if (to === "rejected" || to === "withdrawn") application.decidedAt = at;
  await application.save();
  return from;
}

export async function updateApplicationStatus(
  recruiterId: string,
  applicationId: string,
  status: ApplicationStatus,
): Promise<void> {
  const application = await Application.findById(applicationId).select(
    "job status history decidedAt applicant",
  );
  if (!application) throw applicationNotFound();

  // getOwnedJob throws JOB_NOT_FOUND; normalized here so a foreign
  // application answers exactly as a missing one does.
  //
  // Deliberately no open/closed check: you close a role because you hired
  // someone, and you still have to reject everyone else. Closing changes what
  // the board does, not what the applicant list can do.
  let job;
  try {
    job = await getOwnedJob(recruiterId, String(application.job));
  } catch {
    throw applicationNotFound();
  }

  const from = await transition(application, status, "recruiter");

  // Only stages that carry news, and only when moving forward — a correction
  // back down the pipeline tells the candidate nothing they want to read.
  if (notifiesSeeker(from, status)) {
    // Both reads are needed only on a notifying transition, so they stay inside
    // the branch rather than costing a lookup on every status change.
    const [seeker, company] = await Promise.all([
      Seeker.findById(application.applicant).select("email"),
      Company.findById(job.company).select("name"),
    ]);
    if (seeker?.email) {
      dispatch(
        sendRendered(
          seeker.email,
          renderApplicationStatusEmail(
            status as "shortlisted" | "interview" | "offered" | "rejected",
            job.title,
            company?.name ?? null,
          ),
        ),
      );
    }
  }
}

/**
 * The candidate's exit.
 *
 * Ownership is the application's own `applicant`, not the job's recruiter: this
 * is the one transition the job owner may not perform. A foreign application
 * answers as a missing one, matching every other ownership check here.
 */
export async function withdrawApplication(
  seekerId: string,
  applicationId: string,
): Promise<void> {
  const application = await Application.findOne({
    _id: applicationId,
    applicant: seekerId,
  }).select("job status history decidedAt applicant");
  if (!application) throw applicationNotFound();

  await transition(application, "withdrawn", "seeker");

  // The recruiter is told, because an application that stopped being live would
  // otherwise sit in their queue looking like it was waiting on them.
  const job = await Job.findById(application.job).select("title created_by");
  if (!job?.created_by) return;
  const [recruiter, seeker] = await Promise.all([
    Recruiter.findById(job.created_by).select("email"),
    Seeker.findById(seekerId).select("fullName"),
  ]);
  if (recruiter?.email) {
    dispatch(
      sendRendered(
        recruiter.email,
        renderApplicationWithdrawnEmail(seeker?.fullName ?? "A candidate", job.title),
      ),
    );
  }
}
