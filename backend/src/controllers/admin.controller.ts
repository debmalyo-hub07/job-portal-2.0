import type { Request, Response } from "express";
import {
  adminCreateBodySchema,
  adminListQuerySchema,
  objectIdSchema,
  recruiterDenyBodySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as approvalService from "../services/approval.service.js";
import * as adminConsoleService from "../services/adminConsole.service.js";
import * as adminProvisioningService from "../services/adminProvisioning.service.js";

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(adminCreateBodySchema, req.body);
  await adminProvisioningService.createAdmin(body);
  res.status(201).json({
    success: true,
    message: "Admin invited. A password setup code has been emailed.",
  });
};

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

export const denyRecruiter = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const { reason } = parseBody(recruiterDenyBodySchema, req.body);
  await approvalService.denyRecruiter(id, reason);
  res.status(200).json({ success: true });
};

export const getOverview = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, ...(await adminConsoleService.getOverview()) });
};

export const getInsights = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, ...(await adminConsoleService.getInsights()) });
};

export const getActivity = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, ...(await adminConsoleService.getActivity()) });
};

export const listJobs = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(adminListQuerySchema, req.query);
  res.status(200).json({ success: true, ...(await adminConsoleService.listAllJobs(query)) });
};

export const listCompanies = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(adminListQuerySchema, req.query);
  res.status(200).json({ success: true, ...(await adminConsoleService.listAllCompanies(query)) });
};
