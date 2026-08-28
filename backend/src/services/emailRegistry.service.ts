import { Types } from "mongoose";
import { PORTALS, type Portal } from "@jobportal/shared";
import { AppError } from "../lib/AppError.js";
import { EmailRegistry } from "../models/emailRegistry.model.js";
import { accountModel } from "./account.service.js";

/** The address-taken refusal every creation site answers with. */
export const EMAIL_TAKEN = () =>
  AppError.conflict("EMAIL_TAKEN", "An account already exists for this email address.");

/** E11000 off any unique index, the shape Mongoose surfaces it in. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

/**
 * Claims an address and returns the ObjectId the account must be created with.
 *
 * The registry row is written FIRST — before the account exists — because its
 * unique index is the only cross-portal guarantee. Two concurrent
 * registrations of one address on different portals both pass any
 * application-level check; only one can insert this row. The returned id makes
 * the row and the account name the same subject without a second read.
 *
 * Callers that then fail to create the account MUST call `releaseEmail` with
 * the returned id: an orphan row would squat the address with no account
 * behind it until reconciliation runs.
 */
export async function reserveEmail(portal: Portal, email: string): Promise<Types.ObjectId> {
  const subjectId = new Types.ObjectId();
  try {
    await EmailRegistry.create({ email: email.trim().toLowerCase(), portal, subjectId });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw EMAIL_TAKEN();
    throw error;
  }
  return subjectId;
}

/** Frees a reservation whose account creation failed. Safe when already free. */
export async function releaseEmail(subjectId: Types.ObjectId): Promise<void> {
  await EmailRegistry.deleteOne({ subjectId });
}

/**
 * Registry ⇄ accounts disagreements, for tests and the reconciliation script.
 *
 * The rule is exact: per subject, exactly one row, matching that account's
 * email. Anything else — a row whose subject no longer exists (orphan, the
 * insert-then-crash shape), a row whose subject exists but under a different
 * address (stale, the swap-crash shape), or a subject with no row at all — is
 * listed here. `reconcileEmailRegistry` exists to make this list empty.
 */
export interface RegistryDisagreement {
  kind: "orphan" | "stale" | "missing";
  portal: Portal;
  email?: string;
  subjectId: string;
}

export async function registryDisagreements(): Promise<RegistryDisagreement[]> {
  const problems: RegistryDisagreement[] = [];

  const rows = await EmailRegistry.find({}).lean();
  const rowBySubject = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = String(row.subjectId);
    const existing = rowBySubject.get(key);
    if (existing) {
      // Two rows for one subject is already a disagreement; report the extra
      // one as stale so reconciliation deletes it.
      problems.push({
        kind: "stale",
        portal: row.portal,
        email: row.email,
        subjectId: key,
      });
      continue;
    }
    rowBySubject.set(key, row);
  }

  for (const portal of PORTALS) {
    const accounts = await accountModel(portal)
      .find({})
      .select({ email: 1 })
      .lean();
    for (const account of accounts) {
      const key = String(account._id);
      const row = rowBySubject.get(key);
      rowBySubject.delete(key);
      if (!row || row.email !== account.email) {
        problems.push({ kind: "missing", portal, subjectId: key });
      }
    }
  }

  // Whatever is left on the map belongs to no account in its own portal.
  for (const row of rowBySubject.values()) {
    problems.push({
      kind: "orphan",
      portal: row.portal,
      email: row.email,
      subjectId: String(row.subjectId),
    });
  }

  return problems;
}
