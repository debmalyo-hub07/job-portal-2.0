import type { Portal } from "@jobportal/shared";
import { z } from "zod";

/**
 * Exported for `tests/deployConfig.test.ts`, which checks the deploy blueprint
 * and .env.example against it in both directions. Asking the schema which
 * variables are required beats scanning this file's text: a reformat cannot
 * break it, and adding a variable cannot silently escape the check.
 *
 * `parseEnv` remains the only validated way in — it adds the cross-field rule
 * that the five secrets must all differ, which the schema alone does not know.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),

  MONGO_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_PEPPER: z.string().min(32, "must be at least 32 characters"),
  OTP_PEPPER: z.string().min(32, "must be at least 32 characters"),
  CSRF_SECRET: z.string().min(32, "must be at least 32 characters"),
  ADMIN_PROVISIONING_SECRET: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_BUDGET_MAX_FAILURES: z.coerce.number().int().positive().default(20),
  OTP_BUDGET_WINDOW_HOURS: z.coerce.number().int().positive().default(24),

  /** Age at which an unverified, non-migrated account is deleted. */
  UNVERIFIED_ACCOUNT_TTL_HOURS: z.coerce.number().int().positive().default(24),

  /** How often the in-process sweeper runs. */
  SWEEP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  LOGIN_LOCK_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MAX_MINUTES: z.coerce.number().int().positive().default(15),
  GOOGLE_LINK_CONFIRM_TTL_HOURS: z.coerce.number().int().positive().default(24),

  // Trailing slashes are stripped so the derived Google redirect URIs and the
  // frontend links built from these never contain a double slash. z.url()
  // accepts "http://host:8000/", and Google matches redirect_uri byte-for-byte
  // — an un-normalised base fails at the consent screen, not at boot.
  API_BASE_URL: z.string().url().transform((url) => url.replace(/\/+$/, "")),
  WEB_BASE_URL: z.string().url().transform((url) => url.replace(/\/+$/, "")),

  CLIENT_URLS: z
    .string()
    .transform((value) => value.split(",").map((url) => url.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("strict"),
  COOKIE_DOMAIN: z.string().optional(),

  /**
   * Verbosity. Validated here so a typo is a boot failure that names the
   * variable, but read straight from process.env by `lib/logger.ts` — see the
   * bootstrap exception documented there.
   */
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  /**
   * How much HTTP traffic to log. `summary` is one line per request with
   * /health skipped; `all` includes /health; `off` disables request logging
   * and leaves application-level logs alone.
   */
  LOG_HTTP: z.enum(["summary", "all", "off"]).default("summary"),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().default("Cairn"),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /** Required by parseEnv in production; optional for local development/tests. */
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

  /**
   * P3 of the location-aware phase — deliberately optional EVERYWHERE,
   * production included: the phone-verification routes are dormant by design
   * and mount only when this key exists (see phoneVerification.service and the
   * deployment runbook's activation path). An absent key is a route that does
   * not exist, not a misconfigured deploy.
   */
  SMS_PROVIDER_KEY: z.string().min(1).optional(),

  /**
   * Shared with the web origin's `/api` proxy so it can name the real client
   * address on a request it forwards. Optional here: with it unset the claim is
   * ignored and a proxied request is attributed to the proxy, which is safe and
   * costly — see middleware/clientIp.ts for exactly what it costs.
   *
   * Unlike the five signing secrets this one is a bearer credential: it travels
   * in a header on every proxied request. That is why it must not be one of
   * them, and why the rule below takes it in when it is present.
   */
  PROXY_SHARED_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
});

export type Env = z.infer<typeof envSchema>;

/** The explicit database path in a Mongo URI, or null when Mongo would use `test`. */
export function mongoDatabaseName(uri: string): string | null {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) return null;

  const pathStart = uri.indexOf("/", schemeEnd + 3);
  if (pathStart === -1) return null;

  const path = uri.slice(pathStart + 1).split("?", 1)[0]?.trim();
  if (!path) return null;

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const parsed = result.data;

  if (parsed.NODE_ENV === "production" && !parsed.TURNSTILE_SECRET_KEY) {
    throw new Error(
      "Invalid environment configuration:\n  TURNSTILE_SECRET_KEY: required in production",
    );
  }

  if (parsed.NODE_ENV === "production" && !mongoDatabaseName(parsed.MONGO_URI)) {
    throw new Error(
      "Invalid environment configuration:\n  MONGO_URI: must include an explicit database name in production",
    );
  }

  if (parsed.NODE_ENV === "production") {
    const insecureUrls = [parsed.API_BASE_URL, parsed.WEB_BASE_URL, ...parsed.CLIENT_URLS].filter(
      (url) => new URL(url).protocol !== "https:",
    );
    if (insecureUrls.length > 0) {
      throw new Error(
        "Invalid environment configuration:\n  API_BASE_URL, WEB_BASE_URL and CLIENT_URLS must use HTTPS in production",
      );
    }
  }

  // Reusing one value across these purposes means a leak of any one compromises
  // all of them, and it defeats the point of deriving per-portal keys from a
  // dedicated secret. PROXY_SHARED_SECRET joins the rule whenever it is set,
  // and it is the one that most needs to: the others only ever sign locally,
  // while that one is presented in a header on every proxied request.
  const secrets: Record<string, string> = {
    JWT_ACCESS_SECRET: parsed.JWT_ACCESS_SECRET,
    JWT_REFRESH_PEPPER: parsed.JWT_REFRESH_PEPPER,
    OTP_PEPPER: parsed.OTP_PEPPER,
    CSRF_SECRET: parsed.CSRF_SECRET,
    ADMIN_PROVISIONING_SECRET: parsed.ADMIN_PROVISIONING_SECRET,
    ...(parsed.PROXY_SHARED_SECRET
      ? { PROXY_SHARED_SECRET: parsed.PROXY_SHARED_SECRET }
      : {}),
  };
  const values = Object.values(secrets);
  if (new Set(values).size !== values.length) {
    throw new Error(
      `Invalid environment configuration:\n  ${Object.keys(secrets).join(", ")} must all differ`,
    );
  }

  return parsed;
}

let cached: Env | undefined;

/**
 * Lazy so that test files can set process.env in tests/setup.ts before the
 * first read. Frozen so nothing can mutate config at runtime.
 */
export function env(): Env {
  cached ??= Object.freeze(parseEnv(process.env));
  return cached;
}

/**
 * The callback is portal-pinned, so there are two redirect URIs. Deriving both
 * from API_BASE_URL keeps them from drifting apart. Both must be registered on
 * the Google OAuth client — Google matches redirect_uri byte-for-byte, so a
 * mismatch surfaces as redirect_uri_mismatch at consent time, not at boot.
 */
export function googleRedirectUri(portal: Portal): string {
  return `${env().API_BASE_URL}/api/v1/${portal}/auth/google/callback`;
}
