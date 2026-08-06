import type { Request, Response } from "express";
import { objectIdSchema } from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as approvalService from "../services/approval.service.js";

export const listPendingRecruiters = async (_req: Request, res: Response): Promise<void> => {
  const items = await approvalService.listPendingRecruiters();
  res.status(200).json({ success: true, items });
};

export const approveRecruiter = async (req: Request, res: Response): Promise<void> => {
  // Validated rather than passed through: a malformed id must be a 400, not a
  // Mongoose cast error surfacing as a 500.
  const id = parseBody(objectIdSchema, req.params.id);
  await approvalService.approveRecruiter(id);
  res.status(200).json({ success: true });
};
