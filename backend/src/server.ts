import "dotenv/config";
import { buildApp } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import {
  describeMailerError,
  verifyMailerConfiguration,
} from "./lib/mailer.js";
import { startSweeper } from "./lib/sweeper.js";

async function main(): Promise<void> {
  const config = env();

  await connectDB(config.MONGO_URI);
  void verifyMailerConfiguration()
    .then(() => logger.info("Transactional email configuration verified"))
    .catch((error: unknown) => {
      logger.error(
        { mailError: describeMailerError(error) },
        "Transactional email configuration is unavailable",
      );
    });
  const stopSweeper = startSweeper();

  const server = buildApp().listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        clientUrls: config.CLIENT_URLS,
        webBaseUrl: config.WEB_BASE_URL,
      },
      `API listening on :${config.PORT}`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      stopSweeper();
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
