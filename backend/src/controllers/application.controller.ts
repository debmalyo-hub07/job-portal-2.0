import type { Request, Response } from "express";
import {
  applicationStatusBodySchema,
  bulkStatusBodySchema,
  objectIdSchema,
  paginationQuerySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as applicationService from "../services/application.service.js";

export const applyJob = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.id);
  await applicationService.applyToJob(req.auth!.id, jobId);
  res.status(201).json({ success: true, message: "Job applied successfully." });
};

export const getAppliedJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await applicationService.listAppliedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};

export const getApplicants = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.id);
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await applicationService.listApplicants(req.auth!.id, jobId, query);
  res.status(200).json({ success: true, ...result });
};

export const getQueue = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await applicationService.listApplicationQueue(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  const applicationId = parseBody(objectIdSchema, req.params.id);
  const { status } = parseBody(applicationStatusBodySchema, req.body);
  await applicationService.updateApplicationStatus(req.auth!.id, applicationId, status);
  res.status(200).json({ success: true, message: "Status updated successfully." });
};

/**
 * The bulk move. The job is the route's target and the ids name rows inside
 * it; the service owns the apply-where-legal contract and the honest result.
 */
export const bulkUpdateStatus = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  const { applicationIds, status } = parseBody(bulkStatusBodySchema, req.body);
  const result = await applicationService.bulkUpdateApplicationStatus(
    req.auth!.id,
    jobId,
    applicationIds,
    status,
  );
  res.status(200).json({ success: true, ...result });
};

/**
 * The candidate withdrawing their own application.
 *
 * No body to validate: the target status is not the caller's choice. `withdrawn`
 * is the only transition a seeker has, so naming it in the request would only
 * create a value to disagree about.
 */
export const withdraw = async (req: Request, res: Response): Promise<void> => {
  const applicationId = parseBody(objectIdSchema, req.params.id);
  await applicationService.withdrawApplication(req.auth!.id, applicationId);
  res.status(200).json({ success: true, message: "Application withdrawn." });
};
