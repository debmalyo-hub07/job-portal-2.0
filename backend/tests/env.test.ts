import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const valid = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://localhost:27017/test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_PEPPER: "b".repeat(32),
  CLIENT_URLS: "http://localhost:5173,https://app.example.com",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  BREVO_API_KEY: "brevo",
  BREVO_SENDER_EMAIL: "no-reply@example.com",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
  GOOGLE_REDIRECT_URI: "http://localhost:8000/callback",
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
});
