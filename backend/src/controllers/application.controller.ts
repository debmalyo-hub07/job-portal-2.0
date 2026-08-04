import type { Request, Response } from "express";
import {
  applicationStatusBodySchema,
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

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  const applicationId = parseBody(objectIdSchema, req.params.id);
  const { status } = parseBody(applicationStatusBodySchema, req.body);
  await applicationService.decideApplication(req.auth!.id, applicationId, status);
  res.status(200).json({ success: true, message: "Status updated successfully." });
};
