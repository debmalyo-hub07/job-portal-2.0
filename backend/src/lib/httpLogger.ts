import type { Request, Response } from "express";
import type { Logger } from "pino";
import { pinoHttp, type Options } from "pino-http";

import { logger as defaultLogger } from "./logger.js";

/** How much HTTP traffic to log. Mirrors the `LOG_HTTP` env value. */
export type LogHttpMode = "summary" | "all" | "off";

const LOG_HTTP_MODES: readonly LogHttpMode[] = ["summary", "all", "off"];

/**
 * Reads LOG_HTTP from process.env rather than through `env()`.
 *
 * `buildApp()` is called at module scope by several test files, which happens
 * before `tests/setup.ts` assigns MONGO_URI inside `beforeAll` — so an `env()`
 * call here fails full config validation and takes 16 suites down at import
 * time. This is the same bootstrap exception `lib/logger.ts` documents, and it
 * is safe for the same reason: `server.ts` line 1 is `import "dotenv/config"`.
 *
 * `env()` still declares and validates LOG_HTTP, so a typo is a named boot
 * failure. This function only has to survive being called earlier than that.
 */
export function resolveLogHttpMode(): LogHttpMode {
  const raw = process.env.LOG_HTTP;
  return LOG_HTTP_MODES.includes(raw as LogHttpMode) ? (raw as LogHttpMode) : "summary";
}

/**
 * Request logging that a human can read.
 *
 * The default `pino-http` serializers emit every request *and* response header
 * on every request. With helmet installed that is roughly 44 lines per call —
 * four curl requests filled 175 lines of terminal, almost all of it the same
 * static CSP string. The signal (method, path, status, duration) was there but
 * unfindable, which made the log useless at exactly the moment it mattered.
 *
 * So both header objects are dropped at the serializer, not merely redacted.
 * Redaction is still configured in `logger.ts` as defence in depth, but not
 * serializing a field at all is a stronger guarantee than censoring it: a typo
 * in a redact path fails open and silently ships session cookies to wherever
 * logs are collected.
 */
export function buildHttpLogger(logger: Logger = defaultLogger, mode: LogHttpMode = "summary") {
  const options: Options = {
    logger,

    // Reuse the id the `requestId` middleware already generated, so a log line
    // and the `requestId` in an error response body are the same string. They
    // are useless for correlation if they disagree.
    genReqId: (req) => (req as Request).requestId ?? "",

    serializers: {
      req(req: Request) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          // Only at debug: on a busy log these are noise, but when reproducing a
          // filter bug they are the first thing anyone asks for.
          ...(logger.isLevelEnabled("debug")
            ? {
                query: req.query,
                // `id` and `portal` only. `req.auth` also carries
                // `emailVerified`, which is account state rather than a
                // correlation key and has no business in a request log.
                ...(req.auth ? { auth: { id: req.auth.id, portal: req.auth.portal } } : {}),
              }
            : {}),
        };
      },

      res(res: Response) {
        return { statusCode: res.statusCode };
      },
    },

    /**
     * Severity from status class. Previously every request logged at `info`,
     * so a 500 and a 200 were indistinguishable without reading each line —
     * and no level-based filter could separate them.
     */
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },

    /**
     * `errorHandler` answers an AppError without logging it, so a 4xx would
     * otherwise show a status and no hint of which rule refused. It stashes the
     * code on `res.locals`, the only channel available here: this hook receives
     * the response, never the thrown error.
     */
    customProps(_req, res) {
      const code = (res as Response).locals?.errorCode;
      return typeof code === "string" ? { errorCode: code } : {};
    },

    /**
     * Deliberately empty. The pretty transport renders method/url/status from
     * the serialized fields, so a message here would be appended to that line —
     * returning the status code produced `... 200 7ms id=abc123200`. In
     * production JSON the same fields are present as structured keys, which is
     * what a log aggregator queries; a duplicated human string adds nothing.
     */
    customSuccessMessage() {
      return "";
    },

    customErrorMessage() {
      return "";
    },

    autoLogging:
      mode === "off"
        ? false
        : {
            ignore(req) {
              // A deployed liveness probe polls /health on an interval. At one
              // line per poll it drowns real traffic and pushes it out of any
              // retention window.
              return mode === "summary" && (req.url ?? "").startsWith("/health");
            },
          },
  };

  return pinoHttp(options);
}
