import mongoose, { type HydratedDocument } from "mongoose";
import {
  APPLICATION_STATUSES,
  isMinor,
  notifiesSeeker,
  transitionRefusal,
} from "@jobportal/shared";
import type {
  ApplicantDto,
  ApplicantsPageDto,
  ApplicationEventDto,
  ApplicationStatus,
  AppliedJobDto,
  BulkStatusResult,
  PaginatedResponse,
  PaginationQuery,
  QueuedApplicantDto,
} from "@jobportal/shared";
import { Application, type ApplicationDocument } from "../models/application.model.js";
import type { SeekerDocument } from "../models/seeker.model.js";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { getOwnedJob, toJobDto } from "./job.service.js";
import { scoreSeekerForJob } from "./matching.pipeline.js";
import { signedResumeUrl } from "./resume.service.js";
import { denseDailySeries, isoDay } from "../lib/dailySeries.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import {
  renderApplicantAlertEmail,
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
  // Existence, still open, and — loaded in the same read — everything the
  // eligibility rules below need. `assertJobOpen` selected only `status`; this
  // needs the type, the title (the owner's alert names it) and the poster too,
  // so it loads the job itself.
  const job = await Job.findById(jobId).select("status jobType created_by title");
  if (!job) {
    throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  }
  if (job.status === "closed") {
    throw AppError.conflict("JOB_CLOSED", "This role is no longer accepting applications");
  }

  // Project C: a minor's consequential write is internships only. The DOB is
  // read here rather than trusted from the token because `requireProfileComplete`
  // proves the gate cleared, not which band cleared it — and age crosses a
  // birthday, which a token minted days ago cannot know. The name rides along
  // for the owner's alert below.
  const seeker = await Seeker.findById(seekerId).select("dob guardianConsent fullName");
  if (seeker && isMinor(seeker.dob ?? null) && job.jobType !== "Internship") {
    throw AppError.forbidden(
      "MINOR_NON_INTERNSHIP",
      "Candidates under 18 can apply to internship roles only.",
    );
  }

  // Project D: a suspended recruiter's listings stay live by decision, but
  // taking applications for them is a live write the suspension must block.
  // The copy is deliberately vague — the board does not announce suspensions.
  // The email rides along for the alert below.
  const owner = job.created_by
    ? await Recruiter.findById(job.created_by).select("status email")
    : null;
  if (owner?.status === "suspended") {
    throw AppError.forbidden(
      "JOB_OWNER_SUSPENDED",
      "This employer is not accepting applications right now.",
    );
  }

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

  // P5 of the console automation program: the owner learns about the
  // application the moment it exists. The job, the seeker, and the owner are
  // already in hand — the alert costs no extra read — and an ownerless job
  // (or a deleted owner) has nobody to tell. Fire-and-forget, like every
  // courtesy mail: an application must never fail because its alert did not
  // send.
  if (owner?.email) {
    dispatch(
      sendRendered(
        owner.email,
        renderApplicantAlertEmail(
          seeker?.fullName ?? "Someone",
          job.title,
          `${env().WEB_BASE_URL}/hire/jobs/${jobId}/applicants`,
        ),
      ),
    );
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
): Promise<ApplicantsPageDto> {
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

  // P5's funnel: one aggregate over every application this job holds — the
  // ranked list paginates after scoring, so a client-side count would describe
  // a page, not the pipeline. Zero-filled so every stage renders uniformly.
  // `$match` on the loaded document's own ObjectId: aggregate casting of a
  // route-param string is not a thing to rely on here.
  const rows = await Application.aggregate<{ _id: ApplicationStatus; n: number }>([
    { $match: { job: job._id } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const funnel = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const row of rows) funnel[row._id] = row.n;

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

  // Posting health: derived from the complete set already in memory — zero
  // additional queries, the same set the funnel counted. The series is dense
  // and UTC-keyed so the client never infers a gap; `firstApplicationAt` is
  // the raw fact, and time-to-first stays the client's subtraction.
  const countByDay = new Map<string, number>();
  let firstApplied: Date | null = null;
  for (const { application } of ranked) {
    const at = application.createdAt ?? null;
    if (!at) continue;
    if (!firstApplied || at < firstApplied) firstApplied = at;
    const day = isoDay(at);
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }

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
    funnel,
    health: {
      series: denseDailySeries(countByDay),
      firstApplicationAt: firstApplied?.toISOString() ?? null,
      total,
    },
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

const applicationNotFound = () =>
  AppError.notFound("APPLICATION_NOT_FOUND", "Application not found");

/**
 * The per-job applied check the role page's button state reads.
 *
 * `exists` on {job, applicant} with no job read at all: an application can
 * legitimately outlive its job (the applied list keeps deleted-job rows), so
 * the answer is about the pair, never about the job's existence — which is
 * also why this never 404s for a missing job.
 */
export async function isJobApplied(seekerId: string, jobId: string): Promise<boolean> {
  // `exists` returns a Query, not a value — comparing it directly to null is
  // comparing a thenable object to null, which is always true. Await first.
  return Boolean(await Application.exists({ job: jobId, applicant: seekerId }));
}

/**
 * The recruiter's cross-job queue (Project D): every application on every job
 * the recruiter owns, newest first.
 *
 * Ownership is resolved through the jobs themselves — the applications are
 * found by `{ job: { $in: ownedIds } }` — so a foreign application can no more
 * appear here than in the per-job list, without a single ownership check per
 * row.
 *
 * Paginated at the database rather than after a full fetch: unlike
 * `listApplicants`, whose per-job set is bounded by one posting's audience,
 * this spans every posting the recruiter owns and must stay O(page).
 * Consequence: no global fit ranking (fit is scored per row, against that
 * application's own job, after the page is chosen) and the order is recency —
 * which is also what a queue means.
 */
export async function listApplicationQueue(
  recruiterId: string,
  { page, limit }: PaginationQuery,
): Promise<PaginatedResponse<QueuedApplicantDto>> {
  const ownedJobs = await Job.find({ created_by: recruiterId }).select("_id");
  const ownedIds = ownedJobs.map((job) => job._id);
  // `trusted` because `job` is an ObjectId path: Mongoose otherwise tries to
  // cast the `$in` object itself. And an empty `$in` would be a cast error on
  // an empty array in some driver versions — `{ $in: [] }` matches nothing,
  // which is exactly what a recruiter with no postings deserves, but only if
  // it survives the cast. Early-return the empty page instead.
  if (ownedIds.length === 0) {
    return { items: [], total: 0, page, pages: 0 };
  }
  const filter = { job: mongoose.trusted({ $in: ownedIds }) };

  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "applicant", select: "fullName email phone profile resume" })
      .populate({ path: "job", select: "title company remote location", populate: { path: "company", select: "name" } }),
  ]);

  // The per-row job, for scoring only — the DTO's job fields come from the
  // same populated document, so the fit and the label can never disagree.
  const jobById = new Map(
    ownedJobs.map((job) => [String(job._id), job as unknown as Parameters<typeof scoreSeekerForJob>[1]]),
  );

  return {
    items: (applications as unknown as Array<
      PopulatedApplicant & {
        job: { _id: unknown; title: string; company: { name: string } | null } | null;
      }
    >).map((a) => ({
      applicationId: String(a._id),
      status: a.status as QueuedApplicantDto["status"],
      appliedAt: a.createdAt?.toISOString() ?? "",
      fullName: a.applicant?.fullName ?? "",
      email: a.applicant?.email ?? "",
      phone: a.applicant?.phone ?? null,
      headline: a.applicant?.profile?.headline ?? null,
      skills: a.applicant?.profile?.skills ?? [],
      resumeUrl: signedResumeUrl(a.applicant?.resume?.storageKey),
      resumeName: a.applicant?.resume?.originalName ?? null,
      fit:
        a.applicant && a.job && typeof a.job === "object"
          ? scoreSeekerForJob(a.applicant, jobById.get(String(a.job._id)) ?? (a.job as never))
          : null,
      jobId: a.job && typeof a.job === "object" ? String(a.job._id) : "",
      jobTitle: a.job && typeof a.job === "object" ? a.job.title : "",
      companyName: a.job && typeof a.job === "object" ? a.job.company?.name ?? null : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

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
 * The bulk move: one stage, many of this job's applications, legal rows only.
 *
 * The job's ownership is checked once, and a job the caller does not own is
 * the request's own 404, exactly as the per-job list. Each row then answers
 * for itself through the same guarded state machine a single move runs —
 * history entry, `decidedAt` on terminal stages, the candidate email on
 * notifying stages, byte for byte. A refused row is skipped and reported with
 * its reason rather than vetoing the batch: a real applicant list is mixed,
 * and one decided row must not block nine open ones.
 *
 * A foreign or unknown id is a skipped row, not a 404 — the other rows' work
 * is legal — which is the one place bulk deliberately differs from a single
 * move, where a foreign application answers exactly as a missing one does.
 */
export async function bulkUpdateApplicationStatus(
  recruiterId: string,
  jobId: string,
  applicationIds: string[],
  status: ApplicationStatus,
): Promise<BulkStatusResult> {
  const job = await getOwnedJob(recruiterId, jobId);

  const skipped: BulkStatusResult["skipped"] = [];
  const moved: { applicant: unknown; from: ApplicationStatus }[] = [];

  for (const id of applicationIds) {
    const application = await Application.findById(id).select(
      "job status history decidedAt applicant",
    );
    // Foreign to this job — another recruiter's, or the caller's own other
    // posting, this batch being one job's pipeline — answers as a missing row.
    if (!application || String(application.job) !== jobId) {
      skipped.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    const refusal = transitionRefusal(application.status as ApplicationStatus, status, "recruiter");
    // NOT_ALLOWED_FOR_PORTAL cannot occur — the body schema pins `status` to
    // RECRUITER_SETTABLE — and if it ever did, `transition` below remains the
    // authority and the request fails loudly rather than mis-reporting.
    if (refusal === "TERMINAL" || refusal === "SAME_STATUS") {
      skipped.push({ id, reason: refusal });
      continue;
    }
    const from = await transition(application, status, "recruiter");
    moved.push({ applicant: application.applicant, from });
  }

  // Notifying stages mail exactly the moved rows, byte-for-byte as the single
  // move's mail. The company is constant across the batch, so it is read once;
  // the seekers are one `$in` read rather than one per row.
  const notifying = moved.filter((row) => notifiesSeeker(row.from, status));
  if (notifying.length > 0) {
    const [company, seekers] = await Promise.all([
      Company.findById(job.company).select("name"),
      Seeker.find({
        _id: mongoose.trusted({ $in: notifying.map((row) => row.applicant) }),
      }).select("email"),
    ]);
    const emailByApplicant = new Map(seekers.map((s) => [String(s._id), s.email]));
    for (const row of notifying) {
      const email = emailByApplicant.get(String(row.applicant));
      if (email) {
        dispatch(
          sendRendered(
            email,
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

  return { moved: moved.length, skipped };
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
