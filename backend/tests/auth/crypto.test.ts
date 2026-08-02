import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";

import {
  burnPasswordTime,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../../src/lib/password.js";
import { accessTokenKey, hashRefreshToken } from "../../src/lib/keys.js";
import { generateOtp, hashOtp } from "../../src/lib/otp.js";
import { mintCsrfToken, verifyCsrfToken } from "../../src/lib/csrfToken.js";

/**
 * These primitives are pure and small, and every later task depends on them.
 * They are also the easiest place in the phase to write a bug that no
 * integration test catches: a wrong argument order still returns a boolean, a
 * collapsed key derivation still signs tokens, a biased OTP generator still
 * produces six digits.
 */
describe("password hashing", () => {
  it("produces an Argon2id hash and verifies it", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery staple", hash)).toBe(false);
  });

  it("verifies an inherited bcrypt hash", async () => {
    // Generated with bcryptjs at cost 10 — the inherited codebase's format.
    // The migration cannot rewrite these (it has no plaintext), so login must
    // accept them or every existing user is locked out.
    const legacy = "$2b$10$HBJoTAES2x2vI74iqstVbOD9tK0C8WgzuCVyWk32ocMzP49RcVhgm";
    expect(await verifyPassword("hunter2hunter2", legacy)).toBe(true);
    expect(await verifyPassword("not the password", legacy)).toBe(false);
  });

  it("flags bcrypt for rehash and leaves Argon2id alone", async () => {
    expect(needsRehash("$2b$10$HBJoTAES2x2vI74iqstVbOD9tK0C8WgzuCVyWk32ocMzP49RcVhgm")).toBe(true);
    expect(needsRehash(await hashPassword("x".repeat(12)))).toBe(false);
    expect(needsRehash(null)).toBe(false);
  });

  it("burns comparable time when there is no password", async () => {
    // The timing oracle this closes: if a Google-only account (passwordHash
    // null) returned false instantly while a wrong password cost a full Argon2
    // verify, response time would tell an attacker which accounts have
    // passwords. Measured against a real verify rather than a fixed threshold,
    // because CI machines vary by more than any constant I could pick.
    const hash = await hashPassword("a real password here");

    const realStart = process.hrtime.bigint();
    await verifyPassword("some guess entirely", hash);
    const realMs = Number(process.hrtime.bigint() - realStart) / 1e6;

    const nullStart = process.hrtime.bigint();
    expect(await verifyPassword("some guess entirely", null)).toBe(false);
    const nullMs = Number(process.hrtime.bigint() - nullStart) / 1e6;

    // Within a factor of 4 either way. Loose on purpose: the assertion that
    // matters is "the same order of magnitude", not a precise ratio. An
    // early-return would show up as ~0ms against a ~40ms verify.
    expect(nullMs).toBeGreaterThan(realMs / 4);
    expect(nullMs).toBeLessThan(realMs * 4);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    // A truncated or hand-edited column must fail closed. Throwing here would
    // surface as a 500 on login rather than an authentication failure.
    expect(await verifyPassword("anything", "$argon2id$truncated")).toBe(false);
    expect(await verifyPassword("anything", "not a hash at all")).toBe(false);
  });

  it("burnPasswordTime does real work", async () => {
    const start = process.hrtime.bigint();
    await burnPasswordTime("a guess");
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // A no-op would be sub-millisecond; a real Argon2 verify at m=19MiB is
    // tens of ms even on fast hardware.
    expect(ms).toBeGreaterThan(5);
  });
});

describe("key derivation", () => {
  it("derives a different key per portal, stably", () => {
    const seeker = accessTokenKey("seeker");
    const recruiter = accessTokenKey("recruiter");
    expect(seeker.equals(recruiter)).toBe(false);
    expect(seeker.equals(accessTokenKey("seeker"))).toBe(true);
    expect(seeker).toHaveLength(32);
  });

  it("makes a cross-portal token fail SIGNATURE verification, not a claim check", () => {
    // The highest-value assertion in this task. The token below carries a
    // DELIBERATELY LYING claim: it says type=recruiter and is signed with the
    // seeker key. If verification used one shared secret plus a claim
    // comparison, this would verify and the claim check would be the only thing
    // standing between a seeker and a recruiter route. With per-portal keys it
    // cannot get that far.
    //
    // This is the test that would catch a future refactor collapsing the two
    // keys back into one.
    const forged = jwt.sign(
      { sub: String(new Types.ObjectId()), type: "recruiter" },
      accessTokenKey("seeker"),
      { expiresIn: "5m" },
    );

    expect(() => jwt.verify(forged, accessTokenKey("recruiter"))).toThrow(/invalid signature/);
    // And it does verify under its real key, proving the failure above is the
    // key mismatch rather than a malformed token.
    const honest = jwt.verify(forged, accessTokenKey("seeker")) as { type: string };
    expect(honest.type).toBe("recruiter");
  });

  it("hashes refresh tokens with a keyed digest, stably", () => {
    const token = "an-opaque-refresh-token-value";
    const digest = hashRefreshToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(digest);
    expect(hashRefreshToken(token + "x")).not.toBe(digest);
    // The digest must not be a bare SHA-256 of the token, or a stolen database
    // dump is directly replayable by anyone who can run sha256sum.
    expect(digest).not.toBe(createHash("sha256").update(token).digest("hex"));
  });
});

describe("OTP generation and hashing", () => {
  it("generates unbiased six-digit codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      seen.add(code);
    }
    // A constant, a badly-seeded generator, or a small modulus would collapse
    // the range. 1000 draws from a million values collide rarely.
    expect(seen.size).toBeGreaterThan(900);
  });

  it("binds the hash to the subject", () => {
    // The whole anti-cross-account-redemption mechanism. The same code hashed
    // under two subjects must not collide, or an attacker's own valid code
    // could be redeemed against a victim's account.
    const code = "123456";
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(hashOtp(code, a)).not.toBe(hashOtp(code, b));
    expect(hashOtp(code, a)).toBe(hashOtp(code, a));
    expect(hashOtp(code, a)).toBe(hashOtp(code, String(a)));
    expect(hashOtp(code, a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is not a bare digest of the code", () => {
    // Over a six-digit space the full rainbow table of bare SHA-256 digests is
    // about 32 MB, so any read of otpCodes would convert straight into
    // sessions. The pepper is what makes a database read alone worthless.
    const subject = new Types.ObjectId();
    const bare = createHash("sha256").update(`${String(subject)}:123456`).digest("hex");
    expect(hashOtp("123456", subject)).not.toBe(bare);
  });
});

describe("CSRF token", () => {
  it("verifies a freshly minted token", () => {
    expect(verifyCsrfToken(mintCsrfToken())).toBe(true);
  });

  it("rejects a tampered nonce or MAC", () => {
    const [nonce, mac] = mintCsrfToken().split(".");
    expect(verifyCsrfToken(`${nonce}x.${mac}`)).toBe(false);
    expect(verifyCsrfToken(`${nonce}.${mac}x`)).toBe(false);
    // Two independently minted halves must not combine — this is the forgery a
    // plain double-submit token cannot resist.
    const other = mintCsrfToken().split(".");
    expect(verifyCsrfToken(`${nonce}.${other[1]}`)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    // Each of these reaches verifyCsrfToken from an attacker-controlled header
    // or cookie. Any of them throwing would be a 500 where a 403 belongs.
    for (const bad of ["", "no-dot-at-all", ".", "a.", ".b", "a.b.c", "x".repeat(5000)]) {
      expect(verifyCsrfToken(bad)).toBe(false);
    }
    expect(verifyCsrfToken(undefined)).toBe(false);
  });

  it("mints a distinct token every time", () => {
    // A constant token would validate forever and defeat the whole mechanism.
    const tokens = new Set(Array.from({ length: 50 }, () => mintCsrfToken()));
    expect(tokens.size).toBe(50);
  });
});
