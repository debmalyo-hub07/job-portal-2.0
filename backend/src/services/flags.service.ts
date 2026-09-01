import mongoose from "mongoose";
import {
  FLAG_REGISTRY,
  flagDefault,
  type AdminFlagDto,
  type FlagKey,
  type FlagsResponse,
} from "@jobportal/shared";

import { logger } from "../lib/logger.js";
import { Admin } from "../models/admin.model.js";
import { FeatureFlag } from "../models/featureFlag.model.js";

/**
 * The platform's flag resolution — P3 of the console automation program.
 *
 * Reads go through a small in-memory cache (15s), valid because the deploy is
 * single-instance — the same reasoning the in-memory rate-limit store rests
 * on. A flip is a kill switch measured in seconds: `setFlag` invalidates
 * immediately in this process, and the TTL is only the ceiling for rows
 * changed by some future second process that does not exist.
 */
const CACHE_TTL_MS = 15_000;

let cache: { at: number; overrides: Map<string, boolean> } | null = null;

async function overrides(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.overrides;
  const rows = await FeatureFlag.find({}).select("key enabled");
  const map = new Map(rows.map((row) => [row.key, row.enabled]));
  cache = { at: Date.now(), overrides: map };
  return map;
}

/** What the server acts on: the override where present, the default if not. */
export async function flagEnabled(key: FlagKey): Promise<boolean> {
  const map = await overrides();
  // A stale row for a removed key cannot be looked up by a registered key, so
  // the ghost is invisible by construction.
  return map.get(key) ?? flagDefault(key);
}

/** The public read: resolved values for every registry key, nothing else. */
export async function resolvedFlags(): Promise<FlagsResponse["flags"]> {
  const map = await overrides();
  const flags: FlagsResponse["flags"] = {};
  for (const flag of FLAG_REGISTRY) {
    flags[flag.key] = map.get(flag.key) ?? flag.default;
  }
  return flags;
}

/** The console's read: the registry with resolved state and last-flip detail. */
export async function listFlags(): Promise<AdminFlagDto[]> {
  const rows = await FeatureFlag.find({});
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  const adminIds = [
    ...new Set(
      rows
        .map((row) => (row.lastChangedBy ? String(row.lastChangedBy) : null))
        .filter((id): id is string => id !== null),
    ),
  ];
  const admins = adminIds.length
    ? await Admin.find({ _id: mongoose.trusted({ $in: adminIds }) }).select("email")
    : [];
  const emailById = new Map(admins.map((admin) => [String(admin._id), admin.email]));

  return FLAG_REGISTRY.map((flag) => {
    const row = rowByKey.get(flag.key);
    return {
      key: flag.key,
      description: flag.description,
      enabled: row?.enabled ?? flag.default,
      default: flag.default,
      lastChangedBy: row?.lastChangedBy ? emailById.get(String(row.lastChangedBy)) ?? null : null,
      lastChangedAt: row?.lastChangedAt ? row.lastChangedAt.toISOString() : null,
    };
  });
}

/** The console's write: upsert the override, record the flip, drop the cache. */
export async function setFlag(
  key: FlagKey,
  enabled: boolean,
  adminId: string | null,
): Promise<void> {
  await FeatureFlag.updateOne(
    { key },
    { $set: { enabled, lastChangedBy: adminId, lastChangedAt: new Date() } },
    { upsert: true },
  );
  cache = null;
  logger.info({ key, enabled, adminId }, "feature flag changed");
}
