import type { HydratedDocument } from "mongoose";
import type { CompanyCreateBody, CompanyDto, CompanyUpdateBody } from "@jobportal/shared";
import { Company, type CompanyDocument } from "../models/company.model.js";
import { AppError } from "../lib/AppError.js";
import getDataUri from "../utils/datauri.js";
import { getCloudinary } from "../utils/cloudinary.js";

const notFound = () => AppError.notFound("COMPANY_NOT_FOUND", "Company not found");

const duplicate = () =>
  AppError.conflict("COMPANY_EXISTS", "You already registered a company with this name");

/** Mongo's duplicate-key error; the {userId, name} unique index is the only one here. */
const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;

export function toCompanyDto(doc: HydratedDocument<CompanyDocument>): CompanyDto {
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description ?? null,
    website: doc.website ?? null,
    location: doc.location ?? null,
    logoUrl: doc.logo ?? null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
}

export async function createCompany(
  ownerId: string,
  body: CompanyCreateBody,
): Promise<CompanyDto> {
  try {
    const company = await Company.create({ name: body.name, userId: ownerId });
    return toCompanyDto(company);
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
}

export async function listCompanies(ownerId: string): Promise<CompanyDto[]> {
  const companies = await Company.find({ userId: ownerId }).sort({ createdAt: -1 });
  return companies.map(toCompanyDto);
}

/** Missing and foreign are indistinguishable by design: both 404. */
async function findOwned(
  ownerId: string,
  companyId: string,
): Promise<HydratedDocument<CompanyDocument>> {
  const company = await Company.findOne({ _id: companyId, userId: ownerId });
  if (!company) throw notFound();
  return company;
}

export async function getOwnedCompany(ownerId: string, companyId: string): Promise<CompanyDto> {
  return toCompanyDto(await findOwned(ownerId, companyId));
}

export async function assertCompanyOwned(ownerId: string, companyId: string): Promise<void> {
  await findOwned(ownerId, companyId);
}

export async function updateCompany(
  ownerId: string,
  companyId: string,
  body: CompanyUpdateBody,
  logo?: Express.Multer.File,
): Promise<CompanyDto> {
  const company = await findOwned(ownerId, companyId);
  if (body.name !== undefined) company.name = body.name;
  if (body.description !== undefined) company.description = body.description;
  if (body.website !== undefined) company.website = body.website;
  if (body.location !== undefined) company.location = body.location;
  if (logo) {
    const upload = await getCloudinary().uploader.upload(getDataUri(logo).content as string);
    company.logo = upload.secure_url;
  }
  try {
    await company.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
  return toCompanyDto(company);
}
