import { env } from "../config/env.js";
import {
  describeMailerError,
  verifyMailerConfiguration,
} from "../lib/mailer.js";

async function main(): Promise<void> {
  env();
  await verifyMailerConfiguration();
  console.log("Brevo API authenticated and the configured sender is active.");
}

const invokedDirectly = /check-mail\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  main().catch((error: unknown) => {
    console.error("Brevo configuration check failed:", describeMailerError(error));
    process.exitCode = 1;
  });
}
