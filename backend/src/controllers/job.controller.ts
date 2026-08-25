import type { Request, Response } from "express";
import {
  jobCreateBodySchema,
  jobListQuerySchema,
  jobStatusBodySchema,
  jobUpdateBodySchema,
  objectIdSchema,
  ownedJobsQuerySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as jobService from "../services/job.service.js";

/**
 * The seeker whose profile a `fit` breakdown would describe, or nothing.
 *
 * `req.auth` is set by `optionalAuthenticate`, which resolves seeker *and*
 * recruiter cookies, so the portal check is what keeps a recruiter out. Without
 * it the id would still be looked up in the seekers collection and miss — but
 * that is a wasted read on every recruiter request, and it leaves the guarantee
 * resting on two ObjectIds from different collections never colliding rather
 * than on the portal that was actually authenticated.
 *
 * The portal comes from the verified cookie, never from the query or body — the
 * same source `updateProfile` reads.
 */
const fitViewer = (req: Request): string | undefined =>
  req.auth?.portal === "seeker" ? req.auth.id : undefined;

export const postJob = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(jobCreateBodySchema, req.body);
  const job = await jobService.createJob(req.auth!.id, body);
  res.status(201).json({ success: true, job });
};

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(jobListQuerySchema, req.query);
  const result = await jobService.listPublicJobs(query, fitViewer(req));
  res.status(200).json({ success: true, ...result });
};

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const job = await jobService.getPublicJob(id, fitViewer(req));
  res.status(200).json({ success: true, job });
};

export const getAdminJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(ownedJobsQuerySchema, req.query);
  const result = await jobService.listOwnedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};

export const updateJob = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const body = parseBody(jobUpdateBodySchema, req.body);
  const job = await jobService.updateJob(req.auth!.id, id, body);
  res.status(200).json({ success: true, job });
};

export const updateJobStatus = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const { status } = parseBody(jobStatusBodySchema, req.body);
  const job = await jobService.setJobStatus(req.auth!.id, id, status);
  res.status(200).json({ success: true, job });
};

export const deleteJob = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  await jobService.deleteJob(req.auth!.id, id);
  // 200 with a body rather than 204: the client toasts on success, and an empty
  // response is indistinguishable from a request that never arrived.
  res.status(200).json({ success: true });
};
