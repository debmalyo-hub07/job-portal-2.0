# HTTP request logging — design

Date: 2026-08-09
Status: approved

## Problem

`npm run dev:api` emits **44 log lines per request**. Four curl calls produced
175 lines. The volume is not detail — it is one dump of every Helmet security
response header, repeated on every request, burying the fields that matter.

Two consequences:

- The dev terminal is unreadable. A request that 500s scrolls off screen before
  it can be read, so the log is useless at the moment it is most needed.
- There is no `LOG_LEVEL` anywhere in `src/config/env.ts`. Setting one in
  `.env` does nothing, silently. Verbosity is hardcoded in `lib/logger.ts`:
  `test` → silent, `production` → info, everything else → debug.

The cause is `pino-http`'s default serializers. `app.ts:24` constructs it with
`{ logger, genReqId }` and nothing else, so the default `req`/`res` serializers
run and emit every header on both sides.

## Goals

- One scannable line per request in development.
- Verbosity controlled from `.env`, validated like every other config value.
- Machine-parseable JSON preserved in production — the compact form is a *dev
  transport* concern, not a change to what gets recorded.
- No regression in redaction. Cookies and tokens must stay out of logs.

## Non-goals

- Log shipping, aggregation, or retention. No aggregator is deployed yet.
- Request/response **body** logging. Bodies carry passwords, OTP codes and
  resume PII. `CLAUDE.md` forbids logging an OTP code outright, and a body
  serializer is the most likely way one reaches a log by accident.
- Replacing `pino`/`pino-http`.

## Approach

Configure `pino-http` serializers rather than adding a dependency or writing
custom middleware. The serializers are the layer that is misbehaving, so that is
the layer to fix.

### Target output

Development, `LOG_LEVEL=info` (the default):

```
17:13:04 INFO  GET  /health                     200   7ms  id=69942616
17:13:04 INFO  GET  /api/v1/job/get?keyword=dev 200  41ms  id=14c10942
17:13:05 WARN  POST /api/v1/seeker/auth/login   401  38ms  id=a3f1... code=INVALID_CREDENTIALS
17:13:05 WARN  GET  /api/v1/nonexistent         404   2ms  id=b8c2... code=NOT_FOUND
```

Development, `LOG_LEVEL=debug` adds the selected-detail fields beneath the line:
query params, `auth.id`/`auth.portal` when authenticated, and `responseTime`.

Production is unchanged in shape: newline-delimited JSON, no transport, one
object per request carrying the same fields.

### Level by status

`customLogLevel`:

- `>= 500` or a transport error → `error`
- `>= 400` → `warn`
- otherwise → `info`

This is the change that makes the log useful. Today a 500 and a 200 are both
`INFO`, so severity carries no information and cannot be filtered on.

### Serializers

Replace the defaults:

- `req` → `{ id, method, url }`, plus `query` and `auth` at `debug` only.
  Never headers. The `req.headers.cookie` redact path stays as defence in
  depth, but the header object is no longer serialized at all, which is a
  stronger guarantee than redacting it.
- `res` → `{ statusCode }`. Never headers. The Helmet dump is the entire
  volume problem and nothing consumes it.
- `err` → keep pino's default. Stack traces are the reason the log exists.

`auth` is read from `req.auth` (`src/types/express.d.ts:21`), which is
`{ id, portal, emailVerified }`. Only `id` and `portal` are logged. This is a
useful correlation key and is not PII beyond an opaque id.

### Health-check suppression

`autoLogging.ignore` skips `/health`. A deployed liveness probe polls it on an
interval; at one line per poll it would dominate the log and push real traffic
out of any retention window. Overridable via `LOG_HTTP=all`.

### Configuration

Two new keys in `envSchema` (`src/config/env.ts`):

- `LOG_LEVEL`: `z.enum(["fatal","error","warn","info","debug","trace","silent"])`,
  default `info`.
- `LOG_HTTP`: `z.enum(["summary","all","off"])`, default `summary`.
  `summary` = one line per request, `/health` skipped. `all` = include
  `/health`. `off` = disable request logging entirely, leaving app-level logs.

Both documented in `backend/.env.example` as commented-out defaults, matching
the convention that variables with a default are listed commented-out.

**`lib/logger.ts` reads `LOG_LEVEL` from `process.env` directly, not via
`env()`.** This extends the bootstrap exception already documented at
`logger.ts:3-10`: calling `env()` there would force full config validation at
import time and break the test harness. Load order makes this safe —
`server.ts:1` is `import "dotenv/config"`, which runs before `lib/logger.ts`
evaluates. `NODE_ENV` still wins for `test` (silent) so the suite stays quiet
regardless of a developer's `.env`.

`app.ts` reads `LOG_HTTP` through `env()` as normal — it is called inside
`buildApp()`, well after config is available.

### Error-code correlation

`middleware/error.ts` answers an `AppError` without logging it, so a 4xx shows
a status but never its `code`. The `customSuccessMessage`/`customErrorMessage`
hook cannot see the thrown error, so `errorHandler` attaches
`res.locals.errorCode = err.code` before responding, and the serializer reads
it. Chosen over logging inside `errorHandler` because it keeps one line per
request rather than two, and preserves `pino-http`'s response timing.

Unhandled (non-`AppError`) errors keep their existing `logger.error` call — a
stack trace must not be reduced to a one-liner.

## Testing

`backend/tests/logging.test.ts`, mounting `buildApp()` per the harness rule
(never a listener), with a pino destination stream capturing to an array:

1. A 200 request emits exactly **one** log record.
2. That record carries no `req.headers` and no `res.headers` — the regression
   guard for the 44-line dump.
3. A 500 logs at `error`; a 404 logs at `warn`; a 200 at `info`.
4. An `AppError` response includes its `code`.
5. A request with an auth cookie does **not** emit the cookie value anywhere in
   the serialized record.
6. `/health` emits no record under `LOG_HTTP=summary`, and one under `all`.

Test 5 is the one that must not be dropped. It is the assertion that a future
serializer change cannot quietly reintroduce cookie logging.

## Risks

- **Under-logging in production.** Dropping headers loses `user-agent` and
  `referer`, which are useful for abuse forensics. Accepted: neither is
  actionable today, and both can be added as named fields rather than by
  restoring the whole header dump.
- **`res.locals` coupling.** `errorHandler` and the serializer now share an
  implicit key. Mitigated by test 4, which fails if either side drifts.
