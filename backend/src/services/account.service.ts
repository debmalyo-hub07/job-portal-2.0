import type { Model } from "mongoose";
import type { Portal } from "@jobportal/shared";
import { Seeker, type SeekerDocument } from "../models/seeker.model.js";
import { Recruiter, type RecruiterDocument } from "../models/recruiter.model.js";
import { Admin, type AdminDocument } from "../models/admin.model.js";

export type AccountDocument = SeekerDocument | RecruiterDocument | AdminDocument;

/**
 * Resolves the portal to its collection.
 *
 * A `Record<Portal, Model>` rather than an `if` so that adding a third portal is
 * a compile error everywhere it needs handling, instead of a silently missing
 * branch.
 */
const MODELS = {
  seeker: Seeker,
  recruiter: Recruiter,
  admin: Admin,
} as const;

export function accountModel(portal: Portal): Model<AccountDocument> {
  return MODELS[portal] as unknown as Model<AccountDocument>;
}

/**
 * Derived, never stored. A persisted boolean drifts the moment anything writes
 * `dob` by another path — and there are two such paths (the completion endpoint
 * and the profile update).
 *
 * Admin is ungated by decision: nothing in the platform reads an admin's DOB,
 * and the one account that can unblock every other account must not depend on a
 * new middleware being correct.
 */
export function isProfileComplete(
  portal: Portal,
  account: { dob?: Date | null },
): boolean {
  if (portal === "admin") return true;
  // `undefined` as well as null, and deliberately fail-closed on it. Mongoose
  // types a `default: null` Date as possibly-undefined, and a query that
  // projected `dob` away would hand us undefined at runtime — which must read
  // as "not proven complete", never as "complete". `!= null` covers both.
  return account.dob != null;
}

/**
 * `withSecret` is the only way to read `passwordHash`, which the schema marks
 * `select: false`. Exactly three call sites need it — login, password reset, and
 * Google identity resolution — and each is a credential comparison. A fourth is
 * a design question, not a one-line change.
 *
 * Nothing here is type-enforced: Mongoose types `passwordHash` as present
 * regardless of `select`, so forgetting the flag compiles and then fails at
 * runtime with `undefined`. That is why the flag is at the service boundary
 * rather than left to each caller's `.select()` — one place to grep, one place
 * to get wrong.
 */
type AccountReadOptions = { withSecret?: boolean };

export async function findAccountByEmail(
  portal: Portal,
  email: string,
  options: AccountReadOptions = {},
) {
  // `email` is lowercased by the schema on write; normalise on read too, or a
  // capitalised address silently registers twice.
  const query = accountModel(portal).findOne({ email: email.trim().toLowerCase() });
  return options.withSecret ? query.select("+passwordHash") : query;
}

export async function findAccountById(
  portal: Portal,
  id: string,
  options: AccountReadOptions = {},
) {
  const query = accountModel(portal).findById(id);
  return options.withSecret ? query.select("+passwordHash") : query;
}
