import pino from "pino";

/**
 * Bootstrap exception: the logger reads NODE_ENV straight from process.env
 * rather than going through `env()`. Everything else must use `env()`, but the
 * logger is imported by the error middleware, which is imported before any
 * request is served — calling `env()` here would force full config validation
 * at import time and defeat its laziness. NODE_ENV is a low-risk enum that
 * needs no validation to pick a log level.
 */
const nodeEnv = process.env.NODE_ENV ?? "development";

export const logger = pino({
  level: nodeEnv === "test" ? "silent" : nodeEnv === "production" ? "info" : "debug",
  // Without this, every request log line contains the auth cookie, which turns
  // a log aggregator into a session-token store.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  transport:
    nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});
