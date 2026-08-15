import mongoose from "mongoose";

import { logger } from "../lib/logger.js";
import { mongoDatabaseName } from "./env.js";

/**
 * Injection backstop behind Zod. An operator-shaped VALUE in a filter — the
 * `{ $ne: "" }` a client smuggles through a string field — is compared as a
 * literal instead of executed. Queries that legitimately want an operator opt in
 * with `mongoose.trusted()`; grep for it to see the full list.
 *
 * Set at module scope so it applies to every connection, including the one the
 * test harness opens without going through connectDB.
 */
mongoose.set("sanitizeFilter", true);

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
  logger.info(
    { host: mongoose.connection.host, database: mongoose.connection.name },
    "MongoDB connected",
  );
  if (!mongoDatabaseName(uri)) {
    logger.warn(
      { database: mongoose.connection.name },
      "MONGO_URI has no database name; MongoDB used its implicit default",
    );
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
