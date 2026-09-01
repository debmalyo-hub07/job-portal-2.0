import type { Request, Response } from "express";
import {
  accountSuspendBodySchema,
  adminCreateBodySchema,
  adminListQuerySchema,
  flagKeySchema,
  objectIdSchema,
  portalSchema,
  recruiterDenyBodySchema,
  setFlagBodySchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as approvalService from "../services/approval.service.js";
import * as adminConsoleService from "../services/adminConsole.service.js";
import * as adminProvisioningService from "../services/adminProvisioning.service.js";
import * as flagsService from "../services/flags.service.js";
import * as oversightService from "../services/oversight.service.js";

export const listFlags = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, flags: await flagsService.listFlags() });
};

export const setFlag = async (req: Request, res: Response): Promise<void> => {
  // Registry validation at the boundary: an unregistered key is a 400, never
  // a silently created flag.
  const key = parseBody(flagKeySchema, req.params.key);
  const { enabled } = parseBody(setFlagBodySchema, req.body);
  await flagsService.setFlag(key, enabled, req.auth?.id ? String(req.auth.id) : null);
  res.status(200).json({ success: true });
};

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
  await approvalService.approveRecruiter(id, req.auth?.id ?? null);
  res.status(200).json({ success: true });
};

export const denyRecruiter = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const { reason } = parseBody(recruiterDenyBodySchema, req.body);
  await approvalService.denyRecruiter(id, reason, req.auth?.id ?? null);
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

export const listSeekers = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(adminListQuerySchema, req.query);
  res.status(200).json({ success: true, ...(await adminConsoleService.listAllSeekers(query)) });
};

export const listRecruiters = async (req: Request, res: Response): Promise<void> => {
  const query = parseBody(adminListQuerySchema, req.query);
  res.status(200).json({ success: true, ...(await adminConsoleService.listAllRecruiters(query)) });
};

/**
 * The four oversight actions. The portal arrives as a ROUTE LITERAL through
 * these handlers' mounts, never from the request — the AGENTS.md rule — which
 * is why there are four thin wrappers rather than one :portal parameter.
 */
export const suspendSeeker = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const { reason } = parseBody(accountSuspendBodySchema, req.body);
  await oversightService.suspendAccount("seeker", id, reason, req.auth!.id);
  res.status(200).json({ success: true });
};

export const reinstateSeeker = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  await oversightService.reinstateAccount("seeker", id, req.auth!.id);
  res.status(200).json({ success: true });
};

export const suspendRecruiter = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const { reason } = parseBody(accountSuspendBodySchema, req.body);
  await oversightService.suspendAccount("recruiter", id, reason, req.auth!.id);
  res.status(200).json({ success: true });
};

export const reinstateRecruiter = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  await oversightService.reinstateAccount("recruiter", id, req.auth!.id);
  res.status(200).json({ success: true });
};

/**
 * The per-account history. The `:portal` segment IS request input, so it is
 * validated against the shared enum rather than trusted: an unknown portal is
 * a 400, not a collection-guessing query.
 */
export const accountEvents = async (req: Request, res: Response): Promise<void> => {
  const portal = parseBody(portalSchema, req.params.portal);
  const id = parseBody(objectIdSchema, req.params.id);
  const items = await oversightService.accountHistory(portal, id);
  res.status(200).json({ success: true, items });
};
