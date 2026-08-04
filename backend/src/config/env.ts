import type { Portal } from "@jobportal/shared";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),

  MONGO_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_PEPPER: z.string().min(32, "must be at least 32 characters"),
  OTP_PEPPER: z.string().min(32, "must be at least 32 characters"),
  CSRF_SECRET: z.string().min(32, "must be at least 32 characters"),
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

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().default("Job Portal"),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const parsed = result.data;

  // Reusing one value across four purposes means a leak of any one compromises
  // all four, and it defeats the point of deriving per-portal keys from a
  // dedicated secret.
  const secrets = [
    parsed.JWT_ACCESS_SECRET,
    parsed.JWT_REFRESH_PEPPER,
    parsed.OTP_PEPPER,
    parsed.CSRF_SECRET,
  ];
  if (new Set(secrets).size !== secrets.length) {
    throw new Error(
      "Invalid environment configuration:\n  JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER, OTP_PEPPER and CSRF_SECRET must all differ",
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
