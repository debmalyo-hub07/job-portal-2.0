import type { Request, Response } from "express";
import {
  companyCreateBodySchema,
  companyUpdateBodySchema,
  objectIdSchema,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import * as companyService from "../services/company.service.js";

export const registerCompany = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(companyCreateBodySchema, req.body);
  const company = await companyService.createCompany(req.auth!.id, body);
  res.status(201).json({ success: true, company });
};

export const getCompany = async (req: Request, res: Response): Promise<void> => {
  const companies = await companyService.listCompanies(req.auth!.id);
  res.status(200).json({ success: true, companies });
};

export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const company = await companyService.getOwnedCompany(req.auth!.id, id);
  res.status(200).json({ success: true, company });
};

export const updateCompany = async (req: Request, res: Response): Promise<void> => {
  const id = parseBody(objectIdSchema, req.params.id);
  const body = parseBody(companyUpdateBodySchema, req.body);
  const company = await companyService.updateCompany(
    req.auth!.id,
    id,
    body,
    req.file as Express.Multer.File | undefined,
  );
  res.status(200).json({ success: true, company });
};
