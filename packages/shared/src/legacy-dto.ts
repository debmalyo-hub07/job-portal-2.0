/**
 * Response shapes for the current API.
 *
 * These describe what the API returns *today*, warts included — see the known
 * defects in SECURITY.md. Phase 1C replaces these endpoints with explicit,
 * projected DTOs; when it does, these types are rewritten rather than extended,
 * and the `Legacy` prefix goes away.
 */

export type LegacyCompany = {
  _id: string;
  name: string;
  description?: string;
  website?: string;
  location?: string;
  logo?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type LegacyJob = {
  _id: string;
  title: string;
  description: string;
  requirements?: string[];
  salary: number;
  experienceLevel: number;
  location: string;
  jobType: string;
  position: string;
  company?: LegacyCompany;
  created_by: string;
  applications?: LegacyApplication[];
  createdAt: string;
  updatedAt: string;
};

export type PopulatedApplicant = {
  _id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  profile?: { bio: string | null; skills: string[] };
  resume?: { storageKey: string | null; originalName: string | null };
  createdAt?: string;
};

export type LegacyApplication = {
  _id: string;
  job?: LegacyJob;
  applicant?: PopulatedApplicant;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
};

/** Every current endpoint wraps its payload alongside a `success` flag. */
export type ApiEnvelope<T> = T & {
  success: boolean;
  message?: string;
};

/** Error envelope introduced in Phase 1A. */
export type ApiError = {
  success: false;
  code: string;
  message: string;
  details: unknown[];
  requestId?: string;
};
