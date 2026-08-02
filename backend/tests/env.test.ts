import { describe, expect, it } from "vitest";
import { googleRedirectUri, parseEnv } from "../src/config/env.js";

const valid = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://localhost:27017/test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_PEPPER: "b".repeat(32),
  OTP_PEPPER: "c".repeat(32),
  CSRF_SECRET: "d".repeat(32),
  CLIENT_URLS: "http://localhost:5173,https://app.example.com",
  API_BASE_URL: "http://localhost:8000",
  WEB_BASE_URL: "http://localhost:5173",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  BREVO_API_KEY: "brevo",
  BREVO_SENDER_EMAIL: "no-reply@example.com",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
};

describe("parseEnv", () => {
  it("splits CLIENT_URLS into an array", () => {
    expect(parseEnv(valid).CLIENT_URLS).toEqual([
      "http://localhost:5173",
      "https://app.example.com",
    ]);
  });

  it("defaults PORT to 8000 as a number", () => {
    expect(parseEnv(valid).PORT).toBe(8000);
  });

  it("names the missing variable in the error", () => {
    const { MONGO_URI: _omitted, ...withoutUri } = valid;
    expect(() => parseEnv(withoutUri)).toThrow(/MONGO_URI/);
  });

  it("rejects a short JWT secret", () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: "tooshort" })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it("rejects a malformed sender email", () => {
    expect(() => parseEnv({ ...valid, BREVO_SENDER_EMAIL: "not-an-email" })).toThrow(
      /BREVO_SENDER_EMAIL/,
    );
  });

  it("defaults ACCESS_TOKEN_TTL_MINUTES to 15 as a number", () => {
    expect(parseEnv(valid).ACCESS_TOKEN_TTL_MINUTES).toBe(15);
  });

  it("rejects a secret reused across two purposes", () => {
    expect(() => parseEnv({ ...valid, CSRF_SECRET: valid.JWT_ACCESS_SECRET })).toThrow(
      /must all differ/,
    );
  });

  it("strips trailing slashes from the base URLs", () => {
    const parsed = parseEnv({
      ...valid,
      API_BASE_URL: "http://localhost:8000/",
      WEB_BASE_URL: "http://localhost:5173///",
    });
    expect(parsed.API_BASE_URL).toBe("http://localhost:8000");
    expect(parsed.WEB_BASE_URL).toBe("http://localhost:5173");
  });
});

describe("googleRedirectUri", () => {
  // Reads the real env() against tests/setup.ts, where API_BASE_URL has no
  // trailing slash. Both URIs must be registered on the Google OAuth client
  // verbatim, so this pins the exact strings rather than a shape.
  it("pins one callback per portal", () => {
    expect(googleRedirectUri("seeker")).toBe(
      "http://localhost:8000/api/v1/seeker/auth/google/callback",
    );
    expect(googleRedirectUri("recruiter")).toBe(
      "http://localhost:8000/api/v1/recruiter/auth/google/callback",
    );
  });
});
