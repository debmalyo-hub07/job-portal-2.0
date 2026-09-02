import type { Request, Response } from "express";
import { objectIdSchema, paginationQuerySchema } from "@jobportal/shared";

import { parseBody } from "../lib/validate.js";
import * as savedJobService from "../services/savedJob.service.js";

export const save = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  // 201 when the save was created, 200 when it already existed — either way
  // the state is "saved", and a toggle must never error on stale state.
  const created = await savedJobService.saveJob(req.auth!.id, jobId);
  res.status(created ? 201 : 200).json({ success: true });
};

export const unsave = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  await savedJobService.unsaveJob(req.auth!.id, jobId);
  res.status(200).json({ success: true });
};

/**
 * The per-job check. No body: the caller is not asserting anything to
 * disagree about, and the answer is derived, not stored.
 */
export const check = async (req: Request, res: Response): Promise<void> => {
  const jobId = parseBody(objectIdSchema, req.params.jobId);
  const saved = await savedJobService.isJobSaved(req.auth!.id, jobId);
  res.status(200).json({ success: true, saved });
};

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(paginationQuerySchema, req.query);
  const result = await savedJobService.listSavedJobs(req.auth!.id, query);
  res.status(200).json({ success: true, ...result });
};
