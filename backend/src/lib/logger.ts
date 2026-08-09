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

/**
 * LOG_LEVEL rides the same exception, and is safe for the same reason plus one
 * more: `server.ts` line 1 is `import "dotenv/config"`, so process.env is
 * populated before this module evaluates. `env()` still validates the value —
 * a typo fails the boot and names the variable — but that validation happens
 * later, on first `env()` call.
 *
 * NODE_ENV=test overrides it unconditionally, so a developer's LOG_LEVEL=debug
 * cannot flood the test suite with request logs.
 */
const configuredLevel = process.env.LOG_LEVEL;
const isValidLevel = (value: string | undefined): boolean =>
  value !== undefined &&
  ["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(value);

export const logger = pino({
  level:
    nodeEnv === "test"
      ? "silent"
      : isValidLevel(configuredLevel)
        ? configuredLevel!
        : nodeEnv === "production"
          ? "info"
          : "debug",
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
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            // One line per request. pino-pretty's default prints every
            // remaining key on its own indented line, which reintroduces the
            // multi-line sprawl the serializers exist to remove.
            singleLine: true,
            // Already rendered by messageFormat; without this they print twice.
            ignore: "pid,hostname,req,res,responseTime,errorCode",
            // The `{if req}` guard matters: messageFormat applies to EVERY
            // line, so an unguarded request template blanks the message on
            // startup and error logs — "MongoDB connected" rendered as
            // "   ms  id=". Request lines use the template; everything else
            // keeps its own message.
            // Nested {if} blocks do not close correctly in pino-pretty — an
            // inner {end} terminates the outer block too, which leaked "id="
            // onto every startup line. So each conditional is flat, and the
            // request id rides in the {req.id} slot of the request block.
            messageFormat:
              "{if req}{req.method} {req.url} {res.statusCode} {responseTime}ms id={req.id}{end}" +
              "{if errorCode} {errorCode}{end}{if msg}{msg}{end}",
          },
        }
      : undefined,
});
