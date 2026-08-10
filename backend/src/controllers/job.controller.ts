import type { Request, Response } from "express";
import {
  jobCreateBodySchema,
  jobListQuerySchema,
  objectIdSchema,
  ownedJobsQuerySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as jobService from "../services/job.service.js";

export const postJob = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(jobCreateBodySchema, req.body);
  const job = await jobService.createJob(req.auth!.id, body);
  res.status(201).json({ success: true, job });
};

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(jobListQuerySchema, req.query);
  const result = await jobService.listPublicJobs(query);
  res.status(200).json({ success: true, ...result });
};

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const job = await jobService.getPublicJob(id);
  res.status(200).json({ success: true, job });
};

export const getAdminJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(ownedJobsQuerySchema, req.query);
  const result = await jobService.listOwnedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};
