import type { Request, Response } from "express";
import { Company } from "../models/company.model.js";
import getDataUri from "../utils/datauri.js";
import { getCloudinary } from "../utils/cloudinary.js";
import { AppError } from "../lib/AppError.js";

export const registerCompany = async (req: Request, res: Response): Promise<void> => {
  const { companyName } = req.body;
  if (!companyName) {
    throw AppError.badRequest("MISSING_FIELDS", "Company name is required");
  }
  let company = await Company.findOne({ name: companyName });
  if (company) {
    throw AppError.conflict("COMPANY_EXISTS", "Company already exists");
  }
  company = await Company.create({
    name: companyName,
    userId: req.id,
  });
  res.status(201).json({
    message: "Company registered successfully",
    success: true,
    company,
  });
};

export const getCompany = async (req: Request, res: Response): Promise<void> => {
  const userId = req.id;
  const companies = await Company.find({ userId });
  res.status(200).json({
    message: "Companies fetched successfully",
    success: true,
    companies,
  });
};

export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
  const companyId = req.params.id;
  const company = await Company.findById(companyId);
  if (!company) {
    throw AppError.notFound("COMPANY_NOT_FOUND", "Company not found");
  }
  res.status(200).json({
    message: "Company fetched successfully",
    success: true,
    company,
  });
};

export const updateCompany = async (req: Request, res: Response): Promise<void> => {
  const { name, description, website, location } = req.body;
  const file = req.file as Express.Multer.File;
  const fileUri = getDataUri(file);
  const cloudResponse = await getCloudinary().uploader.upload(fileUri.content as string);
  const logo = cloudResponse.secure_url;

  const updateData = { name, description, website, location, logo };
  const company = await Company.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
  });
  if (!company) {
    throw AppError.notFound("COMPANY_NOT_FOUND", "Company not found");
  }
  res.status(200).json({
    message: "Company updated successfully",
    success: true,
    company,
  });
};
