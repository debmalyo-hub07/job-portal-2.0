import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

/** 24-hex Mongo ObjectId. Route params and body references both use this. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id");

export const companyCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const companyUpdateBodySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  website: z.string().trim().url().max(200).optional(),
  location: z.string().trim().max(120).optional(),
});

/**
 * `requirements` arrives as the legacy comma-string; normalized here so the
 * service never sees the raw shape. Numbers are coerced because the client
 * sends form strings.
 */
export const jobCreateBodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(5000),
  requirements: z
    .string()
    .max(2000)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
  salary: z.coerce.number().positive(),
  experience: z.coerce.number().int().min(0).max(50),
  location: z.string().trim().min(2).max(120),
  jobType: z.string().trim().min(2).max(40),
  position: z.string().trim().min(1).max(120),
  companyId: objectIdSchema,
});

export const jobListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).default(""),
});

/** `pending` is creation-default only; a recruiter can only decide, not undo. */
export const applicationStatusBodySchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type CompanyCreateBody = z.infer<typeof companyCreateBodySchema>;
export type CompanyUpdateBody = z.infer<typeof companyUpdateBodySchema>;
export type JobCreateBody = z.infer<typeof jobCreateBodySchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type ApplicationStatusBody = z.infer<typeof applicationStatusBodySchema>;

export type CompanyDto = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  location: string | null;
  logoUrl: string | null;
  createdAt: string;
};

export type JobDto = {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  salary: number;
  experienceLevel: number;
  location: string;
  jobType: string;
  position: string;
  company: CompanyDto | null;
  createdAt: string;
};

export type AppliedJobDto = {
  id: string; // application id
  status: "pending" | "accepted" | "rejected";
  appliedAt: string;
  job: JobDto | null;
};

/** Everything a recruiter may see about an applicant. Nothing else leaves. */
export type ApplicantDto = {
  applicationId: string;
  status: "pending" | "accepted" | "rejected";
  appliedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  headline: string | null;
  skills: string[];
  resumeUrl: string | null;
  resumeName: string | null;
};
