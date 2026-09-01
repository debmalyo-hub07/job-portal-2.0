import mongoose from "mongoose";
import { signupDomainMatches } from "@jobportal/shared";

import { Company } from "../models/company.model.js";

/**
 * P4's one strong signal: does this signup email live at the website domain
 * of a company already on the platform? Local and strict — see the shared
 * utilities — and deliberately conservative: a genuinely new employer has no
 * company row and can never match.
 */
export async function matchingCompanyForEmail(email: string): Promise<string | null> {
  // `mongoose.trusted`: sanitizeFilter is global, so a bare `$ne` here would
  // be compared as a literal string and fail the cast.
  const companies = await Company.find({
    website: mongoose.trusted({ $ne: null }),
  }).select("name website");
  for (const company of companies) {
    if (signupDomainMatches(email, company.website ?? "")) return company.name;
  }
  return null;
}
